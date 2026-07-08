// couchgaming-display: a tiny Windows helper that drives display topology
// changes atomically via the CCD (SetDisplayConfig) API. Called from the
// CouchGaming Bun binary.
//
// Subcommands:
//   snapshot                 → print current topology as JSON on stdout
//   apply-gaming <tv-id>     → make <tv-id> the only active monitor, primary
//   apply-desktop <path>     → restore topology from a snapshot JSON

#![cfg(windows)]

use std::env;
use std::fs;
use std::process::ExitCode;

use serde::{Deserialize, Serialize};
use windows::Win32::Devices::Display::{
    DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QueryDisplayConfig, SetDisplayConfig,
    DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME, DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_MODE_INFO,
    DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE, DISPLAYCONFIG_MODE_INFO_TYPE_TARGET, DISPLAYCONFIG_PATH_INFO,
    DISPLAYCONFIG_SOURCE_MODE, DISPLAYCONFIG_TARGET_DEVICE_NAME, DISPLAYCONFIG_TARGET_MODE, QDC_ALL_PATHS,
    SDC_APPLY, SDC_SAVE_TO_DATABASE, SDC_USE_SUPPLIED_DISPLAY_CONFIG,
};
use windows::Win32::Foundation::{ERROR_SUCCESS, LUID, WIN32_ERROR};

const SNAPSHOT_VERSION: u32 = 1;
const DISPLAYCONFIG_PATH_ACTIVE: u32 = 0x0000_0001;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let sub = args.get(1).map(String::as_str).unwrap_or("");

    let result = match sub {
        "snapshot" => cmd_snapshot(),
        "apply-gaming" => match args.get(2) {
            Some(id) => cmd_apply_gaming(id),
            None => Err("apply-gaming requires a monitor id".into()),
        },
        "apply-desktop" => match args.get(2) {
            Some(path) => cmd_apply_desktop(path),
            None => Err("apply-desktop requires a snapshot path".into()),
        },
        "" => Err("usage: couchgaming-display {snapshot|apply-gaming <id>|apply-desktop <path>}".into()),
        other => Err(format!("unknown subcommand: {other}")),
    };

    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(1)
        }
    }
}

// -----------------------------------------------------------------------------
// Snapshot: JSON model
// -----------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
struct Snapshot {
    version: u32,
    paths: Vec<SnapshotPath>,
}

#[derive(Serialize, Deserialize)]
struct SnapshotPath {
    friendly_name: String,
    monitor_dev_path: String,
    edid_short_id: String,
    edid_serial: String,
    active: bool,
    primary: bool,
    position_x: i32,
    position_y: i32,
    source_adapter_luid_hi: i32,
    source_adapter_luid_lo: u32,
    source_id: u32,
    target_adapter_luid_hi: i32,
    target_adapter_luid_lo: u32,
    target_id: u32,
    source_mode: Option<SnapshotSourceMode>,
    target_mode: Option<SnapshotTargetMode>,
}

#[derive(Serialize, Deserialize)]
struct SnapshotSourceMode {
    width: u32,
    height: u32,
    pixel_format: u32,
    position_x: i32,
    position_y: i32,
}

#[derive(Serialize, Deserialize)]
struct SnapshotTargetMode {
    pixel_rate: u64,
    h_sync_freq_num: u32,
    h_sync_freq_den: u32,
    v_sync_freq_num: u32,
    v_sync_freq_den: u32,
    active_width: u32,
    active_height: u32,
    total_width: u32,
    total_height: u32,
    scan_line_ordering: i32,
    rotation: i32,
    video_standard: u32,
}

// -----------------------------------------------------------------------------
// Query current topology
// -----------------------------------------------------------------------------

struct Topology {
    paths: Vec<DISPLAYCONFIG_PATH_INFO>,
    modes: Vec<DISPLAYCONFIG_MODE_INFO>,
}

fn query_topology() -> Result<Topology, String> {
    let mut num_paths: u32 = 0;
    let mut num_modes: u32 = 0;
    unsafe {
        let rc = GetDisplayConfigBufferSizes(QDC_ALL_PATHS, &mut num_paths, &mut num_modes);
        if rc != ERROR_SUCCESS {
            return Err(format!("GetDisplayConfigBufferSizes failed: {rc:?}"));
        }
    }

    let mut paths: Vec<DISPLAYCONFIG_PATH_INFO> = vec![Default::default(); num_paths as usize];
    let mut modes: Vec<DISPLAYCONFIG_MODE_INFO> = vec![Default::default(); num_modes as usize];

    unsafe {
        let rc = QueryDisplayConfig(
            QDC_ALL_PATHS,
            &mut num_paths,
            paths.as_mut_ptr(),
            &mut num_modes,
            modes.as_mut_ptr(),
            None,
        );
        if rc != ERROR_SUCCESS {
            return Err(format!("QueryDisplayConfig failed: {rc:?}"));
        }
    }

    paths.truncate(num_paths as usize);
    modes.truncate(num_modes as usize);
    Ok(Topology { paths, modes })
}

fn target_name(luid: LUID, target_id: u32) -> DISPLAYCONFIG_TARGET_DEVICE_NAME {
    let mut name = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
    name.header = DISPLAYCONFIG_DEVICE_INFO_HEADER {
        r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
        size: std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
        adapterId: luid,
        id: target_id,
    };
    unsafe {
        let rc = DisplayConfigGetDeviceInfo(&mut name.header);
        if rc != 0 {
            // Non-fatal: leave name empty. Caller filters on empty later.
        }
    }
    name
}

fn wchar_to_string(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

fn source_mode_at(topo: &Topology, idx: u32) -> Option<&DISPLAYCONFIG_SOURCE_MODE> {
    let m = topo.modes.get(idx as usize)?;
    if m.infoType == DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE {
        unsafe { Some(&m.Anonymous.sourceMode) }
    } else {
        None
    }
}

fn target_mode_at(topo: &Topology, idx: u32) -> Option<&DISPLAYCONFIG_TARGET_MODE> {
    let m = topo.modes.get(idx as usize)?;
    if m.infoType == DISPLAYCONFIG_MODE_INFO_TYPE_TARGET {
        unsafe { Some(&m.Anonymous.targetMode) }
    } else {
        None
    }
}

fn edid_short_and_serial(monitor_dev_path: &str) -> (String, String) {
    // Example dev path: \\?\DISPLAY#BNQ78A7#5&2b9a1c...&0&UID2064#{...}
    // We can extract the 7-char PNP ID after DISPLAY#.
    let up = monitor_dev_path.to_ascii_uppercase();
    let short = up
        .find("DISPLAY#")
        .and_then(|i| up[i + 8..].split('#').next().map(|s| s.to_string()))
        .unwrap_or_default();
    // Serial isn't easily derivable from the dev path; leave empty and rely on
    // the wizard-side MultiMonitorTool enumeration for that. The CouchGaming
    // Bun layer passes us the SAME id it stored, so we only need to match one
    // of monitor_dev_path/edid_short_id.
    (short, String::new())
}

// -----------------------------------------------------------------------------
// snapshot subcommand
// -----------------------------------------------------------------------------

fn cmd_snapshot() -> Result<(), String> {
    let topo = query_topology()?;
    let mut out = Snapshot {
        version: SNAPSHOT_VERSION,
        paths: Vec::new(),
    };

    for p in &topo.paths {
        let name = target_name(p.targetInfo.adapterId, p.targetInfo.id);
        let friendly = wchar_to_string(&name.monitorFriendlyDeviceName);
        let dev_path = wchar_to_string(&name.monitorDevicePath);

        let active = (p.flags & DISPLAYCONFIG_PATH_ACTIVE) != 0;

        let source_mode = source_mode_at(&topo, unsafe { p.sourceInfo.Anonymous.modeInfoIdx });
        let target_mode = target_mode_at(&topo, unsafe { p.targetInfo.Anonymous.modeInfoIdx });

        let (position_x, position_y) = match source_mode {
            Some(sm) => (sm.position.x, sm.position.y),
            None => (0, 0),
        };
        let primary = position_x == 0 && position_y == 0 && active;

        let (short_id, serial) = edid_short_and_serial(&dev_path);

        out.paths.push(SnapshotPath {
            friendly_name: friendly,
            monitor_dev_path: dev_path,
            edid_short_id: short_id,
            edid_serial: serial,
            active,
            primary,
            position_x,
            position_y,
            source_adapter_luid_hi: p.sourceInfo.adapterId.HighPart,
            source_adapter_luid_lo: p.sourceInfo.adapterId.LowPart,
            source_id: p.sourceInfo.id,
            target_adapter_luid_hi: p.targetInfo.adapterId.HighPart,
            target_adapter_luid_lo: p.targetInfo.adapterId.LowPart,
            target_id: p.targetInfo.id,
            source_mode: source_mode.map(|sm| SnapshotSourceMode {
                width: sm.width,
                height: sm.height,
                pixel_format: sm.pixelFormat.0 as u32,
                position_x: sm.position.x,
                position_y: sm.position.y,
            }),
            target_mode: target_mode.map(|tm| SnapshotTargetMode {
                pixel_rate: tm.targetVideoSignalInfo.pixelRate,
                h_sync_freq_num: tm.targetVideoSignalInfo.hSyncFreq.Numerator,
                h_sync_freq_den: tm.targetVideoSignalInfo.hSyncFreq.Denominator,
                v_sync_freq_num: tm.targetVideoSignalInfo.vSyncFreq.Numerator,
                v_sync_freq_den: tm.targetVideoSignalInfo.vSyncFreq.Denominator,
                active_width: tm.targetVideoSignalInfo.activeSize.cx,
                active_height: tm.targetVideoSignalInfo.activeSize.cy,
                total_width: tm.targetVideoSignalInfo.totalSize.cx,
                total_height: tm.targetVideoSignalInfo.totalSize.cy,
                scan_line_ordering: tm.targetVideoSignalInfo.scanLineOrdering.0,
                rotation: p.targetInfo.rotation.0,
                video_standard: unsafe { tm.targetVideoSignalInfo.Anonymous.videoStandard },
            }),
        });
    }

    let json = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
    println!("{json}");
    Ok(())
}

// -----------------------------------------------------------------------------
// apply-gaming subcommand
// -----------------------------------------------------------------------------

fn path_matches(topo: &Topology, path: &DISPLAYCONFIG_PATH_INFO, id: &str) -> bool {
    let name = target_name(path.targetInfo.adapterId, path.targetInfo.id);
    let friendly = wchar_to_string(&name.monitorFriendlyDeviceName);
    let dev_path = wchar_to_string(&name.monitorDevicePath);
    let (short, _) = edid_short_and_serial(&dev_path);
    let _ = topo;

    let up_id = id.to_ascii_uppercase();
    !short.is_empty() && short.eq_ignore_ascii_case(&up_id)
        || friendly.to_ascii_uppercase().contains(&up_id)
        || dev_path.to_ascii_uppercase().contains(&up_id)
}

fn cmd_apply_gaming(tv_id: &str) -> Result<(), String> {
    let mut topo = query_topology()?;

    let mut tv_index: Option<usize> = None;
    for (i, p) in topo.paths.iter().enumerate() {
        if path_matches(&topo, p, tv_id) {
            tv_index = Some(i);
            break;
        }
    }
    let tv_index = tv_index.ok_or_else(|| format!("no display path matched id {tv_id}"))?;

    for (i, p) in topo.paths.iter_mut().enumerate() {
        if i == tv_index {
            p.flags |= DISPLAYCONFIG_PATH_ACTIVE;
        } else {
            p.flags &= !DISPLAYCONFIG_PATH_ACTIVE;
        }
    }

    // Force the gaming source mode position to (0,0) so it becomes primary.
    let source_idx = unsafe { topo.paths[tv_index].sourceInfo.Anonymous.modeInfoIdx };
    if let Some(m) = topo.modes.get_mut(source_idx as usize) {
        if m.infoType == DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE {
            m.Anonymous.sourceMode.position.x = 0;
            m.Anonymous.sourceMode.position.y = 0;
        }
    }

    apply(&topo)
}

// -----------------------------------------------------------------------------
// apply-desktop subcommand
// -----------------------------------------------------------------------------

fn cmd_apply_desktop(snapshot_path: &str) -> Result<(), String> {
    let raw = fs::read_to_string(snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    let snap: Snapshot = serde_json::from_str(&raw).map_err(|e| format!("parse snapshot: {e}"))?;
    if snap.version != SNAPSHOT_VERSION {
        return Err(format!(
            "unsupported snapshot version {}, expected {}",
            snap.version, SNAPSHOT_VERSION
        ));
    }

    let mut topo = query_topology()?;

    // For each path in the current topology, look up the corresponding entry
    // in the snapshot (by dev path or short id). Apply active flag + position.
    for path in topo.paths.iter_mut() {
        let name = target_name(path.targetInfo.adapterId, path.targetInfo.id);
        let dev_path = wchar_to_string(&name.monitorDevicePath);
        let (short, _) = edid_short_and_serial(&dev_path);

        let want = snap.paths.iter().find(|sp| {
            (!sp.monitor_dev_path.is_empty()
                && sp.monitor_dev_path.eq_ignore_ascii_case(&dev_path))
                || (!short.is_empty() && sp.edid_short_id.eq_ignore_ascii_case(&short))
        });

        match want {
            Some(sp) if sp.active => {
                path.flags |= DISPLAYCONFIG_PATH_ACTIVE;
                let source_idx = unsafe { path.sourceInfo.Anonymous.modeInfoIdx };
                if let Some(m) = topo.modes.get_mut(source_idx as usize) {
                    if m.infoType == DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE {
                        m.Anonymous.sourceMode.position.x = sp.position_x;
                        m.Anonymous.sourceMode.position.y = sp.position_y;
                    }
                }
            }
            _ => {
                path.flags &= !DISPLAYCONFIG_PATH_ACTIVE;
            }
        }
    }

    apply(&topo)
}

// -----------------------------------------------------------------------------
// Common apply
// -----------------------------------------------------------------------------

fn apply(topo: &Topology) -> Result<(), String> {
    let flags = SDC_APPLY | SDC_USE_SUPPLIED_DISPLAY_CONFIG | SDC_SAVE_TO_DATABASE;
    let rc: WIN32_ERROR = unsafe {
        WIN32_ERROR(SetDisplayConfig(
            Some(&topo.paths),
            Some(&topo.modes),
            flags,
        ) as u32)
    };
    if rc != ERROR_SUCCESS {
        return Err(format!("SetDisplayConfig failed: {rc:?}"));
    }
    Ok(())
}
