import { mkdir, readFile, writeFile, stat, chmod } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { paths } from '../config/paths.ts'
import { TOOL_MANIFEST } from './manifest.ts'
import { logger } from '../logger/index.ts'

const FILE_TO_PATH: Record<string, string> = {
  'MultiMonitorTool.exe': paths.multiMonitorTool,
  'SoundVolumeView.exe': paths.soundVolumeView,
  'GUIPropView.exe': paths.guiPropView,
}

export async function ensureExtracted(embedded: Record<string, Blob>): Promise<void> {
  await mkdir(paths.toolsDir, { recursive: true })

  for (const entry of TOOL_MANIFEST) {
    const target = FILE_TO_PATH[entry.filename]
    if (!target) {
      throw new Error(`No path mapping for tool: ${entry.filename}`)
    }
    const blob = embedded[entry.filename]
    if (!blob) {
      throw new Error(`Embedded tool missing at build time: ${entry.filename}`)
    }

    if (await fileMatches(target, entry.sha256)) {
      continue
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    if (entry.sha256) {
      const gotSha = sha256(bytes)
      if (gotSha !== entry.sha256) {
        throw new Error(`Embedded ${entry.filename} sha mismatch: expected ${entry.sha256} got ${gotSha}`)
      }
    }

    await writeFile(target, bytes)
    try {
      await chmod(target, 0o755)
    } catch {
      /* windows ignores */
    }
    await logger.info('tools.extracted', { file: entry.filename, target })
  }
}

async function fileMatches(path: string, expectedSha: string | null): Promise<boolean> {
  try {
    await stat(path)
  } catch {
    return false
  }
  if (!expectedSha) return true
  const bytes = await readFile(path)
  return sha256(bytes) === expectedSha
}

export function sha256(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
