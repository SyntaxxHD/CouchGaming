# CouchGaming

Windows background daemon that flips your monitors and audio output when Steam Big Picture opens, and restores them when it closes.

## What it does

- Watches `HKCU\Software\Valve\Steam\BigPictureInForeground` for changes.
- When Big Picture opens: snapshots your current monitor layout and default audio device, then switches to a preconfigured TV-only layout and audio device.
- When Big Picture closes: restores the snapshot.

Runs hidden in the background — no tray icon, no console window.

## Install

1. Download `CouchGaming.exe` from the latest [Release](../../releases).
2. Run it once — the first-run wizard walks you through picking your TV monitor, TV audio device, and (optionally) installing an autostart shortcut.

## Reconfigure

```
CouchGaming.exe --reconfigure
```

## Autostart

```
CouchGaming.exe --install-autostart
CouchGaming.exe --uninstall-autostart
```

## How it works

CouchGaming bundles two portable NirSoft utilities (`MultiMonitorTool.exe`, `SoundVolumeView.exe`) that are extracted to `%LOCALAPPDATA%\CouchGaming\tools\` on first launch and driven via CLI. Config lives at `%APPDATA%\CouchGaming\config.json`; logs at `%APPDATA%\CouchGaming\log.txt`.

## Build

Requires [Bun](https://bun.sh) 1.2+ on Windows for the final `--compile` step (`--windows-hide-console` / `--windows-icon` are Windows-only).

```
bun install
bun run build
```

The `build` script runs `scripts/fetch-tools.ts` first, which downloads the NirSoft binaries into `tools/` (not committed) and verifies their SHA-256 against `src/tools-bootstrap/manifest.ts`.

## Caveats

- If you change your monitor layout while in a Big Picture session, closing Big Picture restores the layout as it was when Big Picture opened, not your current mid-session tweaks.
- Unsigned binary — Windows SmartScreen will warn on first launch.
