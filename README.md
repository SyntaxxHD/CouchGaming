# CouchGaming

Windows background daemon that flips your monitors and audio output when Steam Big Picture opens, and restores them when it closes.

## What it does

- Polls Windows every ~2 s for a top-level Big Picture window (owned by `steamwebhelper.exe` or `steam.exe`).
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

CouchGaming bundles three portable NirSoft utilities (`MultiMonitorTool.exe`, `SoundVolumeView.exe`, `GUIPropView.exe`) that are extracted to `%LOCALAPPDATA%\CouchGaming\tools\` on first launch and driven via CLI. Detection works by enumerating all visible top-level windows and looking for one owned by `steamwebhelper.exe` or `steam.exe` whose title contains "big picture" (or a known localized equivalent). Config lives at `%APPDATA%\CouchGaming\config.json`; logs at `%APPDATA%\CouchGaming\log.txt`.

## Diagnostics

The daemon writes JSON-lines to `%APPDATA%\CouchGaming\log.txt`. If Big Picture is not triggering, open the log and look for these markers:

| Log line                                                 | Meaning                                                                                                                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daemon.started`                                         | Daemon reached the poll loop. If missing, the daemon crashed early or is stuck.                                                                                                                            |
| `tool.run` with `exe: "GUIPropView.exe"` every ~2 s      | Window enumeration is running.                                                                                                                                                                             |
| `watcher.gpv-first-scan`                                 | First successful scan. Includes `totalRows`, `steamRows`, `matched` (title or null), and a sample of Steam-owned rows so you can see what titles Steam is exposing. Paste this if detection is not firing. |
| `watcher.gpv-parse-empty`                                | GUIPropView returned no rows. Rare; usually means the CSV file could not be read back.                                                                                                                     |
| `watcher.gpv-failed`                                     | Spawning GUIPropView failed. Check the `err` field.                                                                                                                                                        |
| `watcher.scan-failed`                                    | A scan attempt threw. Poll backs off to 5 s and retries.                                                                                                                                                   |
| `daemon.no-config-non-interactive`                       | Daemon was launched without a config file and no interactive terminal. Run `--reconfigure`. Exit code 4.                                                                                                   |
| `wizard.no-tty`                                          | The wizard was invoked with no interactive stdin. Exit code 3.                                                                                                                                             |
| `daemon.lock-stale-taking-over`                          | An old lock file was left behind and we recovered it.                                                                                                                                                      |
| `sm.open.snapshot-failed`, `sm.open.display-load-failed` | Big Picture was detected, but MultiMonitorTool failed. Check the `err` field.                                                                                                                              |
| `gaming.enter`, `gaming.exit`                            | Successful transitions.                                                                                                                                                                                    |

Manual test that Steam is exposing a window whose title contains "Big Picture" (from `cmd`, while Big Picture is open):

```
tasklist /v /fi "IMAGENAME eq steamwebhelper.exe" /fo list
```

Look for a `Window Title:` line containing "Big Picture" (or your locale's equivalent). If the title is genuinely different, capture it with `watcher.gpv-first-scan` (run the daemon with `--verbose`) and open an issue.

If you notice a GUIPropView window briefly flashing on the screen every couple of seconds, that is a bug. Open an issue.

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
