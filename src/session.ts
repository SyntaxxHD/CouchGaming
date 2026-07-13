import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { readFileSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import chalk from 'chalk'
import { paths } from './config/paths.ts'
import { loadConfig, backupCorruptConfig } from './config/store.ts'
import { logger, setConsoleEcho } from './logger/index.ts'
import { createStateMachine } from './state-machine/index.ts'
import { runFirstRun } from './wizard/index.ts'
import { findSteamPid } from './session/find-steam-pid.ts'
import { waitForProcessExit } from './session/wait-steam-exit.ts'

const STALE_LOCK_MS = 5 * 60 * 1000
const STEAM_LAUNCH_TIMEOUT_MS = 30_000

export async function runReset(): Promise<void> {
  const config = await loadConfig().catch(() => null)
  if (!config) {
    console.log(chalk.red('No config found. Nothing to reset.'))
    return
  }
  const sm = createStateMachine(config)
  await logger.info('Forcing reset to desktop mode.')
  await sm.onSteamClose()
  await logger.info('Reset complete.')
}

export async function runSession(): Promise<void> {
  const isInteractive = Boolean(process.stdin.isTTY)
  if (isInteractive) setConsoleEcho(true)

  if (!(await acquireLock())) {
    if (isInteractive) console.log('Another CouchGaming session is already running.')
    process.exit(0)
  }

  process.on('exit', releaseLockSync)

  let config
  try {
    config = await loadConfig()
  } catch (err) {
    await logger.warn('Config file is corrupt or unreadable. Backing it up.', { err: String(err) })
    const backupPath = await backupCorruptConfig()
    await logger.warn('Corrupt config backed up.', { backupPath })
    config = null
  }

  if (!config) {
    if (isInteractive) {
      await logger.info('No config found, launching setup wizard.')
      releaseLockSync()
      await runFirstRun()
      console.log('')
      console.log(chalk.gray('Setup done. Launch CouchGaming again to go gaming.'))
      return
    }
    await logger.fatal('No config file found. Run --reconfigure to set up CouchGaming.')
    process.exit(4)
  }

  const sm = createStateMachine(config)

  let reverted = false
  const revertOnce = async (): Promise<void> => {
    if (reverted) return
    reverted = true
    try {
      await sm.onSteamClose()
    } catch (err) {
      await logger.error('Failed to revert display/audio changes.', { err: String(err) })
    }
  }

  const interrupt = async (): Promise<void> => {
    await logger.warn('Interrupted by user. Reverting display and audio changes.')
    await revertOnce()
    process.exit(0)
  }
  process.on('SIGINT', () => void interrupt())
  process.on('SIGTERM', () => void interrupt())

  await logger.info('Entering gaming mode.')
  await sm.onSteamOpen()

  await logger.info('Launching Steam Big Picture.')
  launchBigPicture()

  const pid = await findSteamPid({ timeoutMs: STEAM_LAUNCH_TIMEOUT_MS })
  if (pid === null) {
    await logger.fatal('Steam did not start within 30 seconds. Reverting changes.')
    await revertOnce()
    process.exit(5)
  }
  await logger.info('Waiting for Steam to exit.', { pid })
  const waiter = waitForProcessExit(pid)
  await waiter.exited

  await logger.info('Steam exited. Reverting display and audio changes.')
  await revertOnce()
  await logger.info('Done.')
}

function launchBigPicture(): void {
  const proc = Bun.spawn(['cmd.exe', '/c', 'start', '', 'steam://open/bigpicture'], {
    stdout: 'ignore',
    stderr: 'ignore',
    stdin: 'ignore',
  })
  void proc.exited
}

async function acquireLock(): Promise<boolean> {
  await mkdir(dirname(paths.lockFile), { recursive: true })
  try {
    const raw = await readFile(paths.lockFile, 'utf8')
    const pid = parseInt(raw.trim(), 10)
    if (pid && pidAlive(pid)) {
      const age = await lockAgeMs()
      if (age !== null && age > STALE_LOCK_MS) {
        await logger.warn('Stale lock found. Taking over the session.', { pid, ageMs: age })
      } else {
        return false
      }
    }
  } catch {
    /* no lock or unreadable, fine */
  }
  await writeFile(paths.lockFile, String(process.pid), 'utf8')
  return true
}

async function lockAgeMs(): Promise<number | null> {
  try {
    const s = await stat(paths.lockFile)
    return Date.now() - s.mtimeMs
  } catch {
    return null
  }
}

function releaseLockSync(): void {
  try {
    const raw = readFileSync(paths.lockFile, 'utf8')
    if (parseInt(raw.trim(), 10) === process.pid) unlinkSync(paths.lockFile)
  } catch {
    /* ignore */
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
