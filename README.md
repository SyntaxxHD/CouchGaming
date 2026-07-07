# CouchGaming

One-shot Windows launcher for Steam Big Picture with your TV as the only active display.

## What it does

Run `CouchGaming.exe`. It:

1. Enables your TV, makes it primary, disables your other monitors, switches audio to your TV output.
2. Opens Steam in Big Picture Mode (starts Steam first if it isn't already running).
3. Waits for you to quit Steam.
4. Restores your original monitor layout, primary display, and audio device.

No background daemon, no polling, no tray icon. When Steam exits, CouchGaming exits.

## Install

1. Download `CouchGaming.exe` from the latest [Release](../../releases).
2. Run `CouchGaming.exe --reconfigure` in Windows Terminal or `cmd` for first-run setup: pick your TV, pick your TV audio output, optionally add a Start Menu shortcut.
3. Launch `CouchGaming.exe` (from the shortcut or a terminal) whenever you want to go gaming.

## Flags

```
CouchGaming.exe                       # go gaming (first run: runs the wizard first)
CouchGaming.exe --reconfigure         # re-run the setup wizard
CouchGaming.exe --wizard              # first-run wizard (used automatically)
CouchGaming.exe --install-shortcut    # add a Start Menu shortcut
CouchGaming.exe --uninstall-shortcut  # remove it
CouchGaming.exe --verbose             # echo debug lines to the terminal
```

## How it works

CouchGaming bundles two portable NirSoft utilities (`MultiMonitorTool.exe`, `SoundVolumeView.exe`) that are extracted to `%LOCALAPPDATA%\CouchGaming\tools\` on first launch. Big Picture is launched via the `steam://open/bigpicture` URL. Steam's exit is detected event-driven via PowerShell's `Wait-Process` (zero CPU while you play). Config lives at `%APPDATA%\CouchGaming\config.json`; logs at `%APPDATA%\CouchGaming\log.txt`.

## Diagnostics

The session writes JSON-lines to `%APPDATA%\CouchGaming\log.txt`. Key markers:

| Log line                            | Meaning                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `session.entering-gaming`           | State-machine handoff to gaming mode is starting.                   |
| `sm.open.*`                         | Monitor and audio switch during enter. See `err` fields on failure. |
| `session.launching-bigpicture`      | We fired the `steam://open/bigpicture` URL.                         |
| `session.steam-pid-found`           | Found the `steam.exe` PID we will wait on.                          |
| `session.waiting-for-steam`         | Event-driven wait via PowerShell `Wait-Process`. Idle from here.    |
| `session.steam-exited`              | Steam quit. Reverting.                                              |
| `sm.close.*`                        | Monitor and audio restore during exit.                              |
| `session.done`                      | Successful clean exit.                                              |
| `session.steam-not-launched`        | No `steam.exe` appeared within 30 s. Session reverted. Exit code 5. |
| `session.no-config-non-interactive` | No config and no terminal to run the wizard. Exit code 4.           |
| `session.lock-stale-taking-over`    | A previous CouchGaming session left a stale lock; we recovered it.  |
| `session.interrupted`               | User hit Ctrl+C. Revert path still runs before exit.                |

Manual sanity check that the Big Picture URL handler works on your machine (from `cmd`):

```
start "" steam://open/bigpicture
```

Steam should open into Big Picture. If nothing happens, Steam is not installed or the URL handler is broken; fix that before running CouchGaming.

## Build

Requires [Bun](https://bun.sh) 1.2+ on Windows for the final `--compile` step (`--windows-hide-console` / `--windows-icon` are Windows-only).

```
bun install
bun run build
```

The `build` script runs `scripts/fetch-tools.ts` first, which downloads the NirSoft binaries into `tools/` (not committed) and verifies their SHA-256 against `src/tools-bootstrap/manifest.ts`.

## Caveats

- Big Picture close alone does not revert; you must quit Steam entirely. The trade-off buys us zero polling during gameplay.
- The wizard captures a snapshot of your current desktop monitor layout (resolutions, positions, primary) to `%APPDATA%\CouchGaming\desktop.cfg`. Session exit restores from that snapshot. If you change your monitor arrangement, run `--reconfigure` to re-capture it.
- If you plug in a new monitor after setup, run `--reconfigure` so CouchGaming knows about it.
- Config schema changes require running `--reconfigure`. Old configs are backed up to `config.corrupt-<timestamp>.json` and the session exits with code 4.
- Unsigned binary; Windows SmartScreen will warn on first launch.
