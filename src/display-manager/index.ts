import { readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { paths } from '../config/paths.ts'
import { run } from '../tool-runner/index.ts'
import { parseNirCsv } from '../tool-runner/csv.ts'
import type { MonitorIdKind } from '../config/schema.ts'

export interface DisplayPosition {
  left: number
  top: number
}

export interface DisplayInfo {
  name: string
  monitorName: string
  monitorId: string
  shortId: string
  serial: string
  resolution: string
  position: DisplayPosition | null
  active: boolean
  primary: boolean
  disconnected: boolean
  raw: Record<string, string>
}

export interface StableId {
  id: string
  idKind: MonitorIdKind
}

export async function enumerate(): Promise<DisplayInfo[]> {
  const tmp = join(tmpdir(), `mmt-${process.pid}-${Date.now()}.csv`)
  try {
    await run(paths.multiMonitorTool, ['/scomma', tmp])
    const csv = await readFile(tmp, 'utf8')
    return parseNirCsv(csv).map(toDisplayInfo)
  } finally {
    try {
      await unlink(tmp)
    } catch {
      /* ignore */
    }
  }
}

export function stableId(row: DisplayInfo): StableId | null {
  const serial = row.serial.trim()
  if (serial && serial !== '0' && !/^0+$/.test(serial)) {
    return { id: serial, idKind: 'serial' }
  }
  const shortId = row.shortId.trim()
  if (shortId) return { id: shortId, idKind: 'shortId' }
  return null
}

export async function snapshotToFile(target: string): Promise<void> {
  const result = await run(paths.helperDisplay, ['snapshot'])
  await writeFile(target, result.stdout, 'utf8')
}

export async function applyGaming(tvId: string): Promise<void> {
  await run(paths.helperDisplay, ['apply-gaming', tvId])
}

export async function applyDesktop(snapshotPath: string): Promise<void> {
  await run(paths.helperDisplay, ['apply-desktop', snapshotPath])
}

function toDisplayInfo(row: Record<string, string>): DisplayInfo {
  const yes = (v: string | undefined) => (v ?? '').toLowerCase() === 'yes'
  return {
    name: row['Name'] ?? '',
    monitorName: row['Monitor Name'] ?? '',
    monitorId: row['Monitor ID'] ?? '',
    shortId: row['Short Monitor ID'] ?? '',
    serial: row['Serial Number'] ?? '',
    resolution: row['Resolution'] ?? '',
    position: parsePositionCell(row['Left-Top']),
    active: yes(row['Active']),
    primary: yes(row['Primary']),
    disconnected: yes(row['Disconnected']),
    raw: row,
  }
}

function parsePositionCell(raw: string | undefined): DisplayPosition | null {
  if (!raw) return null
  const parts = raw.split(',').map(s => s.trim())
  if (parts.length < 2) return null
  const left = parseInt(parts[0]!, 10)
  const top = parseInt(parts[1]!, 10)
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null
  return { left, top }
}
