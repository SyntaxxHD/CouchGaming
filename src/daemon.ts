import { mkdir, readFile, writeFile } from "node:fs/promises"
import { readFileSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { paths } from "./config/paths.ts"
import { loadConfig, backupCorruptConfig } from "./config/store.ts"
import { logger } from "./logger/index.ts"
import { createSteamWatcher } from "./steam-watcher/index.ts"
import { createStateMachine } from "./state-machine/index.ts"
import { runFirstRun } from "./wizard/index.ts"

export async function runDaemon(): Promise<void> {
  if (!(await acquireLock())) {
    process.exit(0)
  }

  process.on("exit", releaseLockSync)
  process.on("SIGINT", () => process.exit(0))
  process.on("SIGTERM", () => process.exit(0))

  let config
  try {
    config = await loadConfig()
  } catch (err) {
    await logger.warn("daemon.config-corrupt", { err: String(err) })
    const backupPath = await backupCorruptConfig()
    await logger.warn("daemon.config-backed-up", { backupPath })
    config = null
  }

  if (!config) {
    await logger.info("daemon.no-config-running-wizard")
    releaseLockSync()
    await runFirstRun()
    return
  }

  const sm = createStateMachine(config)
  const watcher = createSteamWatcher({
    pollMs: config.runtime.pollMs,
    debounceMs: config.runtime.debounceMs,
  })

  watcher.on("open", () => {
    sm.onSteamOpen().catch(err => logger.error("daemon.open-failed", { err: String(err) }))
  })
  watcher.on("close", () => {
    sm.onSteamClose().catch(err => logger.error("daemon.close-failed", { err: String(err) }))
  })

  await logger.info("daemon.started", {
    pollMs: config.runtime.pollMs,
    debounceMs: config.runtime.debounceMs,
  })
  watcher.start()

  await new Promise<void>(() => {
    /* run forever */
  })
}

async function acquireLock(): Promise<boolean> {
  await mkdir(dirname(paths.lockFile), { recursive: true })
  try {
    const raw = await readFile(paths.lockFile, "utf8")
    const pid = parseInt(raw.trim(), 10)
    if (pid && pidAlive(pid)) return false
  } catch {
    /* no lock or unreadable — fine */
  }
  await writeFile(paths.lockFile, String(process.pid), "utf8")
  return true
}

function releaseLockSync(): void {
  try {
    const raw = readFileSync(paths.lockFile, "utf8")
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
