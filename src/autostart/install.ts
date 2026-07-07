import { unlink, stat } from "node:fs/promises"
import { join, dirname } from "node:path"
import { run } from "../tool-runner/index.ts"

function shortcutPath(): string {
  const appdata = process.env.APPDATA ?? ""
  return join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "CouchGaming.lnk")
}

function exePath(): string {
  return process.execPath
}

export async function installShortcut(): Promise<void> {
  const target = shortcutPath()
  const exe = exePath()
  const workDir = dirname(exe)
  const escExe = escapePwsh(exe)
  const escTarget = escapePwsh(target)
  const escWork = escapePwsh(workDir)

  const script = [
    `$s = New-Object -ComObject WScript.Shell`,
    `$l = $s.CreateShortcut('${escTarget}')`,
    `$l.TargetPath = '${escExe}'`,
    `$l.WorkingDirectory = '${escWork}'`,
    `$l.IconLocation = '${escExe},0'`,
    `$l.WindowStyle = 7`,
    `$l.Description = 'CouchGaming background daemon'`,
    `$l.Save()`,
  ].join("; ")

  await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script])
}

export async function uninstallShortcut(): Promise<boolean> {
  try {
    await unlink(shortcutPath())
    return true
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return false
    throw err
  }
}

export async function isInstalled(): Promise<boolean> {
  try {
    await stat(shortcutPath())
    return true
  } catch {
    return false
  }
}

function escapePwsh(s: string): string {
  return s.replace(/'/g, "''")
}
