import { appendFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'
import chalk from 'chalk'
import { paths } from '../config/paths.ts'

type Level = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const MAX_BYTES = 2 * 1024 * 1024
const KEEP = 3

let ready = false
let toConsole = false
let verbose = false

export function setConsoleEcho(value: boolean): void {
  toConsole = value
}

export function setVerbose(value: boolean): void {
  verbose = value
}

export async function log(level: Level, msg: string, ctx?: Record<string, unknown>): Promise<void> {
  if (!ready) {
    await mkdir(dirname(paths.logFile), { recursive: true })
    ready = true
  }
  const jsonLine = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(ctx ?? {}) }) + '\n'

  if (toConsole && (level !== 'debug' || verbose)) {
    process.stdout.write(formatForTerminal(level, msg, ctx) + '\n')
  }

  try {
    await appendFile(paths.logFile, jsonLine, 'utf8')
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

function formatForTerminal(level: Level, msg: string, ctx?: Record<string, unknown>): string {
  const time = chalk.gray(shortTime())
  const tag = tagFor(msg)
  const body = prettyMessage(msg, ctx)
  const paint = colorFor(level)

  if (level === 'debug') return `${time} ${chalk.gray('debug')} ${chalk.gray(body)}`
  if (level === 'info') return `${time} ${tag}${paint(body)}`
  if (level === 'warn') return `${time} ${paint('WARN')}  ${body}`
  if (level === 'error') return `${time} ${paint('ERROR')} ${body}`
  return `${time} ${paint('FATAL')} ${body}`
}

function colorFor(level: Level): (s: string) => string {
  switch (level) {
    case 'info':
      return chalk.cyan
    case 'warn':
      return chalk.yellow
    case 'error':
      return chalk.red
    case 'fatal':
      return chalk.redBright.bold
    case 'debug':
    default:
      return chalk.gray
  }
}

function tagFor(msg: string): string {
  if (msg === 'gaming.enter') return chalk.magenta('[TV]   ')
  if (msg === 'gaming.exit') return chalk.blue('[Desk] ')
  if (msg === 'daemon.started') return chalk.green('[OK]   ')
  return ''
}

function prettyMessage(msg: string, ctx?: Record<string, unknown>): string {
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? '  ' + chalk.gray(formatCtx(ctx)) : ''
  return msg + ctxStr
}

function formatCtx(ctx: Record<string, unknown>): string {
  return Object.entries(ctx)
    .map(([k, v]) => `${k}=${stringifyValue(v)}`)
    .join(' ')
}

function stringifyValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 80 ? JSON.stringify(v.slice(0, 77) + '...') : v
  if (v === null || v === undefined) return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function shortTime(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
