import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import { paths } from '../config/paths.ts'

type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const MAX_BYTES = 2 * 1024 * 1024
const KEEP = 3

let ready = false
let toConsole = false

export function setConsoleEcho(value: boolean): void {
  toConsole = value
}

export async function log(level: Level, msg: string, ctx?: Record<string, unknown>): Promise<void> {
  if (!ready) {
    await mkdir(dirname(paths.logFile), { recursive: true })
    ready = true
  }
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(ctx ?? {}) }) + '\n'
  if (toConsole) process.stdout.write(line)
  try {
    await appendFile(paths.logFile, line, 'utf8')
    await maybeRotate()
  } catch {
    // Log failures must never crash the daemon.
  }
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => log('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => log('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log('error', msg, ctx),
  fatal: (msg: string, ctx?: Record<string, unknown>) => log('fatal', msg, ctx),
}

async function maybeRotate(): Promise<void> {
  let size = 0
  try {
    size = (await stat(paths.logFile)).size
  } catch {
    return
  }
  if (size < MAX_BYTES) return

  for (let i = KEEP; i >= 1; i--) {
    const src = i === 1 ? paths.logFile : `${paths.logFile}.${i - 1}`
    const dst = `${paths.logFile}.${i}`
    try {
      if (i === KEEP) {
        try {
          await unlink(dst)
        } catch {
          /* ignore */
        }
      }
      await rename(src, dst)
    } catch {
      // Rotation is best-effort; keep going.
    }
  }
}
