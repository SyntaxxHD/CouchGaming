import prompts from 'prompts'
import chalk from 'chalk'
import { paths } from '../config/paths.ts'
import { saveConfig, loadConfig, newConfig } from '../config/store.ts'
import type { Config } from '../config/schema.ts'
import * as displays from '../display-manager/index.ts'
import * as audio from '../audio-manager/index.ts'
import { installShortcut } from '../autostart/install.ts'
import { captureGamingCfg } from './capture-gaming-cfg.ts'
import { logger, setConsoleEcho } from '../logger/index.ts'

export async function runFirstRun(): Promise<void> {
  if (!(await ensureTty('runFirstRun'))) return
  setConsoleEcho(true)
  console.log('')
  console.log(chalk.bold.magenta('CouchGaming') + chalk.gray('  first-run setup'))
  console.log(chalk.gray('This will configure the TV output for Steam Big Picture Mode.'))
  console.log('')

  const display = await pickDisplay()
  if (!display) return abort()

  const audioPick = await pickAudio()
  if (!audioPick) return abort()

  await captureGamingCfg()

  const config = newConfig(display, audioPick)
  await saveConfig(config)
  console.log(chalk.green('OK') + ` config written to ${chalk.cyan(paths.configFile)}`)

  await offerAutostart()

  console.log('')
  console.log(chalk.green('Setup complete.') + ' Launch Steam Big Picture to test.')
}

export async function runReconfigure(): Promise<void> {
  if (!(await ensureTty('runReconfigure'))) return
  setConsoleEcho(true)
  const existing = await loadConfig()
  if (!existing) return runFirstRun()

  const { section } = await prompts({
    type: 'select',
    name: 'section',
    message: 'What would you like to change?',
    choices: [
      { title: 'Audio device only', value: 'audio' },
      { title: 'Display / capture new gaming layout', value: 'display' },
      { title: 'Both', value: 'both' },
      { title: 'Autostart (install/uninstall)', value: 'autostart' },
      { title: 'Cancel', value: 'cancel' },
    ],
  })
  if (!section || section === 'cancel') return

  let updated: Config = existing

  if (section === 'audio' || section === 'both') {
    const audioPick = await pickAudio()
    if (!audioPick) return abort()
    updated = { ...updated, audio: audioPick }
  }
  if (section === 'display' || section === 'both') {
    const display = await pickDisplay()
    if (!display) return abort()
    await captureGamingCfg()
    updated = { ...updated, display }
  }
  if (section === 'autostart') {
    await offerAutostart()
    return
  }

  await saveConfig(updated)
  console.log(chalk.green('OK') + ` config updated at ${chalk.cyan(paths.configFile)}`)
}

async function ensureTty(where: string): Promise<boolean> {
  if (process.stdin.isTTY) return true
  await logger.fatal('wizard.no-tty', { where })
  process.exit(3)
}

async function pickDisplay(): Promise<Config['display'] | null> {
  console.log(chalk.gray('Enumerating displays...'))
  const list = await displays.enumerate()
  if (list.length === 0) {
    console.log(chalk.yellow('No displays found.'))
    return null
  }
  const { choice } = await prompts({
    type: 'select',
    name: 'choice',
    message: 'Select your TV monitor (for labeling only, the layout is captured separately)',
    choices: list.map((d, i) => ({
      title: `${d.active ? '[ACTIVE] ' : '         '}${d.monitorName || d.name}, ${d.resolution || '?'}${d.primary ? ' (primary)' : ''}`,
      value: i,
    })),
  })
  if (choice === undefined) return null
  const picked = list[choice]!
  return {
    gamingCfgPath: paths.gamingCfg,
    gamingMonitorLabel: picked.monitorName || picked.name,
    gamingMonitorDeviceName: picked.name,
  }
}

async function pickAudio(): Promise<Config['audio'] | null> {
  console.log(chalk.gray('Enumerating audio devices...'))
  const all = await audio.enumerate()
  const outputs = all.filter(d => d.direction === 'Render' && !d.disabled)
  if (outputs.length === 0) {
    console.log(chalk.yellow('No audio output devices found.'))
    return null
  }
  const { choice } = await prompts({
    type: 'select',
    name: 'choice',
    message: 'Select your TV audio output',
    choices: outputs.map((d, i) => ({
      title: `${d.isDefaultMultimedia ? '[DEFAULT] ' : '          '}${d.name}, ${d.deviceName}`,
      value: i,
    })),
  })
  if (choice === undefined) return null
  const picked = outputs[choice]!
  return {
    gamingDeviceId: picked.commandLineId,
    gamingDeviceLabel: picked.name,
  }
}

async function offerAutostart(): Promise<void> {
  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: 'Install autostart shortcut so CouchGaming runs at login?',
    initial: true,
  })
  if (!install) return
  try {
    await installShortcut()
    console.log(chalk.green('OK') + ' autostart shortcut installed.')
  } catch (err) {
    console.log(chalk.red('Autostart install failed:') + ` ${String(err)}`)
  }
}

function abort(): void {
  console.log(chalk.yellow('Setup cancelled.'))
}
