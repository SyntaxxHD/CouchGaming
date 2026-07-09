# CouchGaming

One-shot Windows launcher for Steam Big Picture with your TV as the primary display.

## What it does

Run `CouchGaming.exe`. It:

1. Enables your TV, makes it the primary display, and switches audio to your TV output.
2. Opens Steam in Big Picture Mode.
3. Waits for you to quit Steam.
4. Moves the primary display back to whatever it was before, disables the TV, restores audio.

## Install

1. Download `CouchGaming.exe` from the latest [Release](../../releases).
2. Run `CouchGaming.exe --reconfigure` in Windows Terminal or `cmd` for first-run setup: pick your TV, pick your TV audio output, optionally add a Start Menu shortcut.
3. Launch `CouchGaming.exe` (from the shortcut or a terminal) whenever you want to go gaming.

## Flags

```
CouchGaming.exe                       # go gaming (first run: runs the wizard first)
CouchGaming.exe --reconfigure         # re-run the setup wizard
CouchGaming.exe --install-shortcut    # add a Start Menu shortcut
CouchGaming.exe --uninstall-shortcut  # remove it
CouchGaming.exe --verbose             # echo debug lines to the terminal
```

## Diagnostics

The session writes JSON-lines to `%APPDATA%\CouchGaming\log.txt`. Key markers:

| Log line                            | Meaning                                                             |
| ----------------------------------- | ------------------------------------------------------------------- |
| `session.entering-gaming`           | State machine handoff to gaming mode is starting.                   |
| `sm.open.*`                         | Monitor and audio switch during enter. See `err` fields on failure. |
| `session.launching-bigpicture`      | We fired the `steam://open/bigpicture` URL.                         |
| `session.steam-pid-found`           | Found the `steam.exe` PID we will wait on.                          |
| `session.waiting-for-steam`         | Event-driven wait via PowerShell `Wait-Process`. Idle from here.    |
| `session.steam-exited`              | Steam quit. Reverting.                                              |
| `sm.close.*`                        | Restore primary + disable TV + audio restore.                       |
| `session.done`                      | Successful clean exit.                                              |
| `session.steam-not-launched`        | No `steam.exe` appeared within 30 s. Session reverted. Exit code 5. |
| `session.no-config-non-interactive` | No config and no terminal to run the wizard. Exit code 4.           |
| `session.lock-stale-taking-over`    | A previous CouchGaming session left a stale lock; we recovered it.  |
| `session.interrupted`               | User hit Ctrl+C. Revert path still runs before exit.                |
