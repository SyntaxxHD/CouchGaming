import { mkdir, readFile, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { paths } from '../config/paths.ts'
import { run } from '../tool-runner/index.ts'
import { parseNirCsv } from '../tool-runner/csv.ts'

export interface DisplayInfo {
  name: string
  monitorName: string
  monitorId: string
  resolution: string
  active: boolean
  primary: boolean
  disconnected: boolean
}

export async function saveConfig(target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await run(paths.multiMonitorTool, ['/SaveConfig', target])
}

export async function loadConfig(source: string): Promise<void> {
  await run(paths.multiMonitorTool, ['/LoadConfig', source])
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

function toDisplayInfo(row: Record<string, string>): DisplayInfo {
  const yes = (v: string | undefined) => (v ?? '').toLowerCase() === 'yes'
  return {
    name: row['Name'] ?? '',
    monitorName: row['Monitor Name'] ?? '',
    monitorId: row['Monitor ID'] ?? '',
    resolution: row['Resolution'] ?? '',
    active: yes(row['Active']),
    primary: yes(row['Primary']),
    disconnected: yes(row['Disconnected']),
  }
}
