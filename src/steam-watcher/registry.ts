import { run } from '../tool-runner/index.ts'
import { logger } from '../logger/index.ts'

const KEY = 'HKCU\\Software\\Valve\\Steam'
const VALUE = 'BigPictureInForeground'
const LINE_RE = /BigPictureInForeground[^\S\n]+REG_DWORD[^\S\n]+0x([0-9a-fA-F]+)/i

let firstReadLogged = false

export async function readBigPictureValue(): Promise<number> {
  const { stdout, stderr, code } = await run('reg.exe', ['QUERY', KEY, '/v', VALUE], {
    allowNonZero: true,
  })

  if (!firstReadLogged) {
    firstReadLogged = true
    await logger.debug('watcher.reg-first-read', {
      code,
      stdoutSample: stdout.slice(0, 300),
      stderrSample: stderr.slice(0, 200),
    })
  }

  if (code !== 0) {
    await logger.debug('watcher.reg-code-nonzero', { code, stderr: stderr.slice(0, 200) })
    return 0
  }

  const match = LINE_RE.exec(stdout)
  if (!match) {
    await logger.debug('watcher.reg-parse-miss', { stdoutSample: stdout.slice(0, 300) })
    return 0
  }
  return parseInt(match[1]!, 16)
}
