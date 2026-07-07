import prompts from 'prompts'
import chalk from 'chalk'
import { paths } from '../config/paths.ts'
import { saveConfig, loadConfig, newConfig } from '../config/store.ts'
import type { Config, MonitorRef } from '../config/schema.ts'
import * as displays from '../display-manager/index.ts'
import * as audio from '../audio-manager/index.ts'
import { installShortcut } from '../shortcut/install.ts'
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

  const config = newConfig(display, audioPick)
  await saveConfig(config)
  console.log(chalk.green('OK') + ` config written to ${chalk.cyan(paths.configFile)}`)

  await offerShortcut()

  console.log('')
  console.log(chalk.green('Setup complete.') + ' Launch CouchGaming to go gaming.')
}

export async function runReconfigure(): Promise<void> {
  if (!(await ensureTty('runReconfigure'))) return
  setConsoleEcho(true)
  const existing = await loadConfig().catch(() => null)
  if (!existing) return runFirstRun()

  const { section } = await prompts({
    type: 'select',
    name: 'section',
    message: 'What would you like to change?',
    choices: [
      { title: 'Audio device only', value: 'audio' },
      { title: 'Displays (pick a new TV / redetect desktop monitors)', value: 'display' },
      { title: 'Both', value: 'both' },
      { title: 'Start Menu shortcut (install/uninstall)', value: 'shortcut' },
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
    updated = { ...updated, display }
  }
  if (section === 'shortcut') {
    await offerShortcut()
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
  const active = list.filter(d => d.active && !d.disconnected)
  if (active.length === 0) {
    console.log(chalk.yellow('No active displays found.'))
    return null
  }
  if (active.length === 1) {
    console.log(chalk.yellow('Only one active display detected. Plug in your TV and rerun --reconfigure.'))
    return null
  }

  const { choice } = await prompts({
    type: 'select',
    name: 'choice',
    message: 'Select your TV monitor',
    choices: active.map((d, i) => ({
      title: `${d.monitorName || d.name} ${chalk.gray(`(${d.resolution || '?'}${d.primary ? ', primary' : ''})`)}`,
      value: i,
    })),
  })
  if (choice === undefined) return null

  const tvRow = active[choice]!
  const tvId = displays.stableId(tvRow)
  if (!tvId) {
    console.log(
      chalk.red('Could not compute a stable ID for the TV. Missing Serial Number and Short Monitor ID.'),
    )
    return null
  }
  const gamingMonitor: MonitorRef = {
    id: tvId.id,
    idKind: tvId.idKind,
    label: labelFor(tvRow),
    position: positionOf(tvRow),
  }

  const desktopMonitors: MonitorRef[] = []
  for (let i = 0; i < active.length; i++) {
    if (i === choice) continue
    const row = active[i]!
    const sid = displays.stableId(row)
    if (!sid) {
      console.log(chalk.yellow(`Skipping "${labelFor(row)}": no stable ID.`))
      continue
    }
    desktopMonitors.push({
      id: sid.id,
      idKind: sid.idKind,
      label: labelFor(row),
      position: positionOf(row),
    })
  }

  const desktopSummary =
    desktopMonitors
      .map(m => `${m.label}${m.position ? ` (at ${m.position.left},${m.position.top})` : ' (no position)'}`)
      .join(', ') || '(none)'
  console.log(
    chalk.gray(
      `Gaming: ${gamingMonitor.label}. Desktop monitors that will disable on Big Picture: ${desktopSummary}`,
    ),
  )

  return { gamingMonitor, desktopMonitors }
}

function labelFor(row: displays.DisplayInfo): string {
  return row.monitorName || row.shortId || row.name || 'Unknown monitor'
}

function positionOf(row: displays.DisplayInfo): MonitorRef['position'] {
  return row.position
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

async function offerShortcut(): Promise<void> {
  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: 'Create a Start Menu shortcut for CouchGaming?',
    initial: true,
  })
  if (!install) return
  try {
    await installShortcut()
    console.log(chalk.green('OK') + ' Start Menu shortcut installed.')
  } catch (err) {
    console.log(chalk.red('Shortcut install failed:') + ` ${String(err)}`)
  }
}

function abort(): void {
  console.log(chalk.yellow('Setup cancelled.'))
}
