import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { paths } from '../config/paths.ts'
import { run } from '../tool-runner/index.ts'
import { parseNirCsv } from '../tool-runner/csv.ts'
import { logger } from '../logger/index.ts'

const BPM_TITLE_SUBSTRINGS = [
  'big picture',
  'big-picture',
  '大屏幕模式',
  '大螢幕模式',
  '빅 픽처',
  'ビッグピクチャ',
]

const STEAM_PROCESSES = new Set(['steamwebhelper.exe', 'steam.exe'])

let firstScanLogged = false

export async function isBigPictureVisible(): Promise<boolean> {
  const tmp = join(tmpdir(), `gpv-${process.pid}-${Date.now()}.csv`)
  let csv: string
  try {
    await run(paths.guiPropView, ['/scomma', tmp])
    csv = await readFile(tmp, 'utf8')
  } catch (err) {
    await logger.warn('watcher.gpv-failed', { err: String(err) })
    throw err
  } finally {
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
  }

  const rows = parseNirCsv(csv)
  if (rows.length === 0) {
    await logger.debug('watcher.gpv-parse-empty')
    return false
  }

  const steamRows = rows.filter(r => isVisible(r) && isSteamProcess(r['Process Filename']))
  const matched = steamRows.find(r => titleMatches(r['Title'] ?? ''))

  if (!firstScanLogged) {
    firstScanLogged = true
    await logger.debug('watcher.gpv-first-scan', {
      totalRows: rows.length,
      steamRows: steamRows.length,
      matched: matched ? matched['Title'] : null,
      steamRowSample: steamRows.slice(0, 6).map(r => ({
        title: r['Title'],
        proc: r['Process Filename'],
        cls: r['Class Name'],
      })),
    })
  }

  return matched !== undefined
}

function isVisible(row: Record<string, string>): boolean {
  return (row['Visible'] ?? '').toLowerCase() === 'yes'
}

function isSteamProcess(procField: string | undefined): boolean {
  if (!procField) return false
  const lower = procField.toLowerCase()
  const base = lower.split(/[\\/]/).pop() ?? lower
  return STEAM_PROCESSES.has(base)
}

function titleMatches(title: string): boolean {
  const lower = title.toLowerCase()
  return BPM_TITLE_SUBSTRINGS.some(s => lower.includes(s.toLowerCase()))
}
