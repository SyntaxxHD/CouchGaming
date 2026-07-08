import { mkdir, readFile, writeFile, stat, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { paths } from '../config/paths.ts'
import { TOOL_MANIFEST } from './manifest.ts'
import { logger } from '../logger/index.ts'

interface ExtractSpec {
  filename: string
  target: string
  sha256: string | null
}

const FILE_TO_PATH: Record<string, string> = {
  'MultiMonitorTool.exe': paths.multiMonitorTool,
  'SoundVolumeView.exe': paths.soundVolumeView,
  'couchgaming-display.exe': paths.helperDisplay,
}

const LOCAL_HELPERS: readonly { filename: string }[] = [{ filename: 'couchgaming-display.exe' }]

export async function ensureExtracted(embedded: Record<string, Blob>): Promise<void> {
  await mkdir(paths.toolsDir, { recursive: true })

  const specs: ExtractSpec[] = []
  for (const entry of TOOL_MANIFEST) {
    const target = FILE_TO_PATH[entry.filename]
    if (!target) throw new Error(`No path mapping for tool: ${entry.filename}`)
    specs.push({ filename: entry.filename, target, sha256: entry.sha256 })
  }
  for (const helper of LOCAL_HELPERS) {
    const target = FILE_TO_PATH[helper.filename]
    if (!target) throw new Error(`No path mapping for helper: ${helper.filename}`)
    specs.push({ filename: helper.filename, target, sha256: null })
  }

  for (const spec of specs) {
    const blob = embedded[spec.filename]
    if (!blob) {
      throw new Error(`Embedded tool missing at build time: ${spec.filename}`)
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const gotSha = sha256(bytes)

    if (spec.sha256 && gotSha !== spec.sha256) {
      throw new Error(`Embedded ${spec.filename} sha mismatch: expected ${spec.sha256} got ${gotSha}`)
    }

    if (await fileMatchesBytes(spec.target, bytes, gotSha)) {
      continue
    }

    await writeFile(spec.target, bytes)
    try {
      await chmod(spec.target, 0o755)
    } catch {
      /* windows ignores */
    }
    await logger.info('tools.extracted', { file: spec.filename, target: spec.target })
  }
}

async function fileMatchesBytes(path: string, bytes: Uint8Array, sha: string): Promise<boolean> {
  try {
    const info = await stat(path)
    if (info.size !== bytes.length) return false
  } catch {
    return false
  }
  const onDisk = await readFile(path)
  return sha256(onDisk) === sha
}

export function sha256(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
