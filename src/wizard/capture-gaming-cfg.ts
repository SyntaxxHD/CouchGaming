import prompts from 'prompts'
import chalk from 'chalk'
import { run } from '../tool-runner/index.ts'
import * as displays from '../display-manager/index.ts'
import { paths } from '../config/paths.ts'

export async function captureGamingCfg(): Promise<void> {
  console.log('')
  console.log(chalk.bold('Next: capture the TV-only layout.'))
  console.log('  1. I will open Windows display settings.')
  console.log('  2. Disable every monitor EXCEPT your TV, click Apply.')
  console.log('  3. Come back here and press Enter.')
  console.log('')

  const { open } = await prompts({
    type: 'confirm',
    name: 'open',
    message: 'Open Windows display settings now?',
    initial: true,
  })
  if (open) {
    try {
      await run('cmd.exe', ['/c', 'start', 'ms-settings:display'], {
        allowNonZero: true,
        timeoutMs: 5000,
      })
    } catch {
      // Non-fatal, user can open settings manually.
    }
  }

  await prompts({
    type: 'invisible',
    name: 'wait',
    message: 'Press Enter once only the TV is active...',
  })

  await displays.saveConfig(paths.gamingCfg)
  console.log(chalk.green('OK') + ` gaming layout captured to ${chalk.cyan(paths.gamingCfg)}`)

  await prompts({
    type: 'invisible',
    name: 'restore',
    message: 'Now restore your normal desktop layout (re-enable your other monitors), then press Enter.',
  })
}
