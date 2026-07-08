import mmt from '../tools/MultiMonitorTool.exe' with { type: 'file' }
import svv from '../tools/SoundVolumeView.exe' with { type: 'file' }
import cgd from '../tools/couchgaming-display.exe' with { type: 'file' }
import chalk from 'chalk'
import { runSession } from './session.ts'
import { runFirstRun, runReconfigure } from './wizard/index.ts'
import { installShortcut, uninstallShortcut } from './shortcut/install.ts'
import { ensureExtracted } from './tools-bootstrap/index.ts'
import { logger, setConsoleEcho, setVerbose } from './logger/index.ts'

const embeddedTools: Record<string, Blob> = {
  'MultiMonitorTool.exe': Bun.file(mmt),
  'SoundVolumeView.exe': Bun.file(svv),
  'couchgaming-display.exe': Bun.file(cgd),
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))

  if (args.has('--verbose') || args.has('-v')) {
    setVerbose(true)
    args.delete('--verbose')
    args.delete('-v')
  }

  try {
    await ensureExtracted(embeddedTools)
  } catch (err) {
    setConsoleEcho(true)
    await logger.fatal('bootstrap.failed', { err: String(err) })
    process.exit(2)
  }

  if (args.has('--install-shortcut')) {
    setConsoleEcho(true)
    await installShortcut()
    console.log(chalk.green('OK') + ' Start Menu shortcut installed.')
    return
  }
  if (args.has('--uninstall-shortcut')) {
    setConsoleEcho(true)
    const removed = await uninstallShortcut()
    console.log(removed ? chalk.green('OK') + ' Start Menu shortcut removed.' : 'No shortcut found.')
    return
  }
  if (args.has('--reconfigure')) {
    await runReconfigure()
    return
  }
  if (args.has('--wizard')) {
    await runFirstRun()
    return
  }

  await runSession()
}

main().catch(async err => {
  setConsoleEcho(true)
  await logger.fatal('main.crash', { err: String(err), stack: (err as Error).stack })
  process.exit(1)
})
