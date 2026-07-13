import { logger } from '../logger/index.ts'

export interface WaiterHandle {
  exited: Promise<number>
  cancel(): void
}

export function waitForProcessExit(pid: number): WaiterHandle {
  const proc = Bun.spawn(
    [
      'powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `try { Wait-Process -Id ${pid} -ErrorAction Stop } catch { exit 0 }`,
    ],
    {
      stdout: 'ignore',
      stderr: 'pipe',
      stdin: 'ignore',
    },
  )

  const exited = proc.exited.then(code => {
    void logger.debug('Steam process watcher exited.', { pid, code })
    return code
  })

  return {
    exited,
    cancel() {
      try {
        proc.kill()
      } catch {
        /* ignore */
      }
    },
  }
}
