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
CouchGaming.exe --reset               # force TV off and restore primary (use if a crash left things stuck)
CouchGaming.exe --install-shortcut    # add a Start Menu shortcut
CouchGaming.exe --uninstall-shortcut  # remove it
CouchGaming.exe --verbose             # echo debug lines to the terminal
```
