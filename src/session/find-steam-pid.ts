import { run } from '../tool-runner/index.ts'
import { logger } from '../logger/index.ts'

export interface FindOptions {
  timeoutMs: number
  intervalMs?: number
}

export async function findSteamPid(opts: FindOptions): Promise<number | null> {
  const intervalMs = opts.intervalMs ?? 1000
  const deadline = Date.now() + opts.timeoutMs
  let attempt = 0

  while (Date.now() < deadline) {
    attempt++
    try {
      const { stdout } = await run('tasklist.exe', ['/fi', 'IMAGENAME eq steam.exe', '/fo', 'csv', '/nh'], {
        allowNonZero: true,
        timeoutMs: 5000,
      })
      const pid = parseTasklistPid(stdout)
      if (pid !== null) return pid
    } catch (err) {
      await logger.debug('session.find-pid-tick-failed', { err: String(err), attempt })
    }
    if (Date.now() + intervalMs >= deadline) break
    await sleep(intervalMs)
  }
  return null
}

function parseTasklistPid(stdout: string): number | null {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.toLowerCase().startsWith('"steam.exe"')) continue
    const cols = line.split('","')
    if (cols.length < 2) continue
    const raw = (cols[1] ?? '').replace(/"/g, '').trim()
    const pid = parseInt(raw, 10)
    if (Number.isFinite(pid) && pid > 0) return pid
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
