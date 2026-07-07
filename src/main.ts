import mmt from '../tools/MultiMonitorTool.exe' with { type: 'file' }
import svv from '../tools/SoundVolumeView.exe' with { type: 'file' }
import { runDaemon } from './daemon.ts'
import { runFirstRun, runReconfigure } from './wizard/index.ts'
import { installShortcut, uninstallShortcut } from './autostart/install.ts'
import { ensureExtracted } from './tools-bootstrap/index.ts'
import { logger, setConsoleEcho } from './logger/index.ts'

const embeddedTools: Record<string, Blob> = {
  'MultiMonitorTool.exe': Bun.file(mmt),
  'SoundVolumeView.exe': Bun.file(svv),
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2))

  try {
    await ensureExtracted(embeddedTools)
  } catch (err) {
    setConsoleEcho(true)
    await logger.fatal('bootstrap.failed', { err: String(err) })
    process.exit(2)
  }

  if (args.has('--install-autostart')) {
    setConsoleEcho(true)
    await installShortcut()
    console.log('Autostart installed.')
    return
  }
  if (args.has('--uninstall-autostart')) {
    setConsoleEcho(true)
    const removed = await uninstallShortcut()
    console.log(removed ? 'Autostart removed.' : 'No autostart shortcut found.')
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

  await runDaemon()
}

main().catch(async err => {
  setConsoleEcho(true)
  await logger.fatal('main.crash', { err: String(err), stack: (err as Error).stack })
  process.exit(1)
})
