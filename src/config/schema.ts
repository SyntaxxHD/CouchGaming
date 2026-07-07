export const CONFIG_VERSION = 1

export interface Config {
  version: typeof CONFIG_VERSION
  display: {
    gamingCfgPath: string
    gamingMonitorLabel: string
    gamingMonitorDeviceName: string
  }
  audio: {
    gamingDeviceId: string
    gamingDeviceLabel: string
  }
  runtime: {
    pollMs: number
    debounceMs: number
    desktopSnapshotPath: string
  }
}

export function validateConfig(value: unknown): Config {
  if (!isRecord(value)) throw new ConfigError("config must be an object")
  if (value.version !== CONFIG_VERSION)
    throw new ConfigError(`unsupported config version: ${String(value.version)}`)

  const display = value.display
  if (!isRecord(display)) throw new ConfigError("config.display is missing")
  requireString(display, "gamingCfgPath")
  requireString(display, "gamingMonitorLabel")
  requireString(display, "gamingMonitorDeviceName")

  const audio = value.audio
  if (!isRecord(audio)) throw new ConfigError("config.audio is missing")
  requireString(audio, "gamingDeviceId")
  requireString(audio, "gamingDeviceLabel")

  const runtime = value.runtime
  if (!isRecord(runtime)) throw new ConfigError("config.runtime is missing")
  requireNumber(runtime, "pollMs")
  requireNumber(runtime, "debounceMs")
  requireString(runtime, "desktopSnapshotPath")

  return value as unknown as Config
}

export class ConfigError extends Error {
  override name = "ConfigError"
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function requireString(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "string" || obj[key] === "") {
    throw new ConfigError(`missing or empty string: ${key}`)
  }
}

function requireNumber(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "number" || !Number.isFinite(obj[key])) {
    throw new ConfigError(`missing or invalid number: ${key}`)
  }
}
