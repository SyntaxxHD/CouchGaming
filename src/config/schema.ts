export const CONFIG_VERSION = 4

export type MonitorIdKind = 'serial' | 'shortId'

export interface MonitorPosition {
  left: number
  top: number
}

export interface MonitorRef {
  id: string
  idKind: MonitorIdKind
  label: string
  position: MonitorPosition | null
}

export interface Config {
  version: typeof CONFIG_VERSION
  display: {
    gamingMonitor: MonitorRef
    desktopMonitors: MonitorRef[]
    desktopCfgPath: string
  }
  audio: {
    gamingDeviceId: string
    gamingDeviceLabel: string
  }
  runtime: {
    pollMs: number
    debounceMs: number
  }
}

export function validateConfig(value: unknown): Config {
  if (!isRecord(value)) throw new ConfigError('config must be an object')
  if (value.version !== CONFIG_VERSION) {
    throw new ConfigError(
      `unsupported config version: ${String(value.version)}. Run --reconfigure to recreate it.`,
    )
  }

  const display = value.display
  if (!isRecord(display)) throw new ConfigError('config.display is missing')
  const gamingMonitor = validateMonitorRef(display.gamingMonitor, 'display.gamingMonitor')
  const desktopMonitorsRaw = display.desktopMonitors
  if (!Array.isArray(desktopMonitorsRaw)) {
    throw new ConfigError('config.display.desktopMonitors must be an array')
  }
  const desktopMonitors = desktopMonitorsRaw.map((r, i) =>
    validateMonitorRef(r, `display.desktopMonitors[${i}]`),
  )
  requireString(display, 'desktopCfgPath')

  const audio = value.audio
  if (!isRecord(audio)) throw new ConfigError('config.audio is missing')
  requireString(audio, 'gamingDeviceId')
  requireString(audio, 'gamingDeviceLabel')

  const runtime = value.runtime
  if (!isRecord(runtime)) throw new ConfigError('config.runtime is missing')
  requireNumber(runtime, 'pollMs')
  requireNumber(runtime, 'debounceMs')

  return {
    version: CONFIG_VERSION,
    display: {
      gamingMonitor,
      desktopMonitors,
      desktopCfgPath: display.desktopCfgPath as string,
    },
    audio: {
      gamingDeviceId: audio.gamingDeviceId as string,
      gamingDeviceLabel: audio.gamingDeviceLabel as string,
    },
    runtime: {
      pollMs: runtime.pollMs as number,
      debounceMs: runtime.debounceMs as number,
    },
  }
}

function validateMonitorRef(value: unknown, where: string): MonitorRef {
  if (!isRecord(value)) throw new ConfigError(`${where} must be an object`)
  const id = value.id
  const idKind = value.idKind
  const label = value.label
  if (typeof id !== 'string' || id === '') throw new ConfigError(`${where}.id is missing`)
  if (idKind !== 'serial' && idKind !== 'shortId') {
    throw new ConfigError(`${where}.idKind must be 'serial' or 'shortId'`)
  }
  if (typeof label !== 'string') throw new ConfigError(`${where}.label must be a string`)
  const position = parsePosition(value.position, `${where}.position`)
  return { id, idKind, label, position }
}

function parsePosition(value: unknown, where: string): MonitorPosition | null {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new ConfigError(`${where} must be an object or null`)
  const left = value.left
  const top = value.top
  if (typeof left !== 'number' || !Number.isFinite(left)) {
    throw new ConfigError(`${where}.left must be a number`)
  }
  if (typeof top !== 'number' || !Number.isFinite(top)) {
    throw new ConfigError(`${where}.top must be a number`)
  }
  return { left, top }
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireString(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== 'string' || obj[key] === '') {
    throw new ConfigError(`missing or empty string: ${key}`)
  }
}

function requireNumber(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key])) {
    throw new ConfigError(`missing or invalid number: ${key}`)
  }
}
