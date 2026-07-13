import { logger } from '../logger/index.ts'

export interface RunOptions {
  timeoutMs?: number
  cwd?: string
  allowNonZero?: boolean
  stdin?: string
}

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

export class ToolError extends Error {
  override name = 'ToolError'
  constructor(
    public exe: string,
    public args: string[],
    public code: number,
    public stdout: string,
    public stderr: string,
  ) {
    super(`${exe} exited with code ${code}: ${stderr.trim() || stdout.trim()}`)
  }
}

export async function run(exe: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const started = Date.now()
  const timeoutMs = opts.timeoutMs ?? 15_000

  const proc = Bun.spawn([exe, ...args], {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: opts.stdin === undefined ? 'ignore' : 'pipe',
  })

  if (opts.stdin !== undefined && proc.stdin) {
    proc.stdin.write(opts.stdin)
    proc.stdin.end()
  }

  const timer = setTimeout(() => {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
  }, timeoutMs)

  const [stdoutText, stderrText, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(timer)

  const durationMs = Date.now() - started
  await logger.debug('Tool invoked.', { exe, args, code, durationMs })

  if (code !== 0 && !opts.allowNonZero) {
    throw new ToolError(exe, args, code, stdoutText, stderrText)
  }
  return { stdout: stdoutText, stderr: stderrText, code }
}
