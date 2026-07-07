# CouchGaming

Windows background daemon that flips your monitors and audio output when Steam Big Picture opens, and restores them when it closes.

## What it does

- Watches `HKCU\Software\Valve\Steam\BigPictureInForeground` for changes.
- When Big Picture opens: snapshots your current monitor layout and default audio device, then switches to a preconfigured TV-only layout and audio device.
- When Big Picture closes: restores the snapshot.

Runs hidden in the background. No tray icon, no console window.

## Install

1. Download `CouchGaming.exe` from the latest [Release](../../releases).
2. Run `CouchGaming.exe --reconfigure` from a real terminal (Windows Terminal or `cmd`). The first-run wizard walks you through picking your TV monitor, TV audio device, and (optionally) installing an autostart shortcut.
3. Launch the daemon: `CouchGaming.exe` from a terminal to see live output, or let the Startup shortcut do it silently at login.

## Flags

```
CouchGaming.exe                     # run the daemon
CouchGaming.exe --reconfigure       # re-run the setup wizard
CouchGaming.exe --wizard            # first-run wizard (used automatically)
CouchGaming.exe --install-autostart
CouchGaming.exe --uninstall-autostart
CouchGaming.exe --verbose           # echo debug lines to the terminal
```

## How it works

CouchGaming bundles two portable NirSoft utilities (`MultiMonitorTool.exe`, `SoundVolumeView.exe`) that are extracted to `%LOCALAPPDATA%\CouchGaming\tools\` on first launch and driven via CLI. Config lives at `%APPDATA%\CouchGaming\config.json`; logs at `%APPDATA%\CouchGaming\log.txt`.

## Diagnostics

The daemon writes JSON-lines to `%APPDATA%\CouchGaming\log.txt`. If Big Picture is not triggering, open the log and look for these markers:

| Log line                                                 | Meaning                                                                                                                                 |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `daemon.started`                                         | Daemon reached the poll loop. If missing, the daemon crashed early or is stuck.                                                         |
| `tool.run` with `exe: "reg.exe"` every ~1.5 s            | Registry polling is working.                                                                                                            |
| `watcher.reg-first-read`                                 | First `reg.exe` read; includes a sample of stdout for debugging locale / format issues.                                                 |
| `watcher.reg-parse-miss`                                 | Parsed the output but did not find the DWORD. Steam is either not writing the value, or the output format differs (see `stdoutSample`). |
| `watcher.reg-code-nonzero`                               | `reg.exe` returned non-zero. Usually means the value does not exist yet (Steam has never entered Big Picture on this account).          |
| `watcher.steam-key-missing-or-zero`                      | Emitted once when the observed value is `0`. Not an error, just informational.                                                          |
| `daemon.no-config-non-interactive`                       | Daemon was launched without a config file and no interactive terminal. Run `--reconfigure`. Exit code 4.                                |
| `wizard.no-tty`                                          | The wizard was invoked with no interactive stdin. Exit code 3.                                                                          |
| `daemon.lock-stale-taking-over`                          | An old lock file was left behind and we recovered it.                                                                                   |
| `sm.open.snapshot-failed`, `sm.open.display-load-failed` | Big Picture was detected, but MultiMonitorTool failed. Check the `err` field.                                                           |
| `gaming.enter`, `gaming.exit`                            | Successful transitions.                                                                                                                 |

Manual test that Steam is actually writing the DWORD (from `cmd`):

```
reg query HKCU\Software\Valve\Steam /v BigPictureInForeground
```

Run this while Big Picture is open. If you see `REG_DWORD    0x<pid>`, Steam is doing its job and the daemon can trigger. If you see `ERROR: The system was unable to find the specified registry key or value.`, open Big Picture at least once (Steam only creates the value after its first Big Picture launch on that account).

## Build

Requires [Bun](https://bun.sh) 1.2+ on Windows for the final `--compile` step (`--windows-hide-console` / `--windows-icon` are Windows-only).

```
bun install
bun run build
```

The `build` script runs `scripts/fetch-tools.ts` first, which downloads the NirSoft binaries into `tools/` (not committed) and verifies their SHA-256 against `src/tools-bootstrap/manifest.ts`.

## Caveats

- If you change your monitor layout while in a Big Picture session, closing Big Picture restores the layout as it was when Big Picture opened, not your current mid-session tweaks.
- Unsigned binary; Windows SmartScreen will warn on first launch.
