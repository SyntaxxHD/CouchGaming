import { mkdir, rename, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { paths } from './paths.ts'
import { validateConfig, CONFIG_VERSION, type Config } from './schema.ts'

export async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(paths.configFile, 'utf8')
    return validateConfig(JSON.parse(raw))
  } catch (err: unknown) {
    if (isNotFound(err)) return null
    throw err
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(dirname(paths.configFile), { recursive: true })
  const tmp = `${paths.configFile}.tmp`
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', 'utf8')
  await rename(tmp, paths.configFile)
}

export async function backupCorruptConfig(): Promise<string | null> {
  try {
    await stat(paths.configFile)
  } catch (err: unknown) {
    if (isNotFound(err)) return null
    throw err
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = `${paths.configFile}.corrupt-${stamp}.json`
  await rename(paths.configFile, target)
  return target
}

export function newConfig(display: Config['display'], audio: Config['audio']): Config {
  return {
    version: CONFIG_VERSION,
    display,
    audio,
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}
