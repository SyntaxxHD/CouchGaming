import { join } from 'node:path'

const APPDATA = process.env.APPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming')
const LOCALAPPDATA = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local')

const appDir = join(APPDATA, 'CouchGaming')
const toolsDir = join(LOCALAPPDATA, 'CouchGaming', 'tools')

export const paths = {
  appDir,
  toolsDir,
  configFile: join(appDir, 'config.json'),
  logFile: join(appDir, 'log.txt'),
  lockFile: join(appDir, 'session.lock'),
  multiMonitorTool: join(toolsDir, 'MultiMonitorTool.exe'),
  soundVolumeView: join(toolsDir, 'SoundVolumeView.exe'),
} as const
