import { logger } from '../logger/index.ts'
import type { Config } from '../config/schema.ts'
import * as displays from '../display-manager/index.ts'
import * as audio from '../audio-manager/index.ts'

type State = 'Desktop' | 'Gaming'
interface Snapshot {
  audioCommandLineId: string | null
  audioLabel: string
  originalPrimaryId: string | null
}

export interface StateMachine {
  onSteamOpen(): Promise<void>
  onSteamClose(): Promise<void>
}

export function createStateMachine(config: Config): StateMachine {
  let state: State = 'Desktop'
  let snapshot: Snapshot | null = null
  let busy: Promise<unknown> = Promise.resolve()

  const tvId = config.display.gamingMonitor.id
  const desktopIds = config.display.desktopMonitors.map(m => m.id)
  const desktopIdSet = new Set(desktopIds)

  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = busy.then(fn, fn)
    busy = next.catch(() => undefined)
    return next
  }

  async function enterGaming(): Promise<void> {
    if (state === 'Gaming') {
      await logger.debug('Already in gaming mode, skipping.')
      return
    }

    let allDisplays: displays.DisplayInfo[] = []
    try {
      allDisplays = await displays.enumerate()
    } catch (err) {
      await logger.warn('Could not enumerate displays.', { err: String(err) })
    }

    const tvDisplay = allDisplays.find(d => d.shortId === tvId || d.serial === tvId)
    if (!tvDisplay) {
      await logger.error(
        `TV monitor not found. Configured ID "${tvId}" does not match any connected display. Run --reconfigure to fix this.`,
        { availableIds: allDisplays.map(d => d.shortId || d.serial).filter(Boolean) },
      )
      return
    }

    let currentAudio: audio.AudioDevice | null = null
    try {
      currentAudio = await audio.getDefaultRender()
    } catch (err) {
      await logger.warn('Could not read current audio device.', { err: String(err) })
    }

    const primaryRow = allDisplays.find(d => d.active && d.primary && !d.disconnected)
    const primarySid = primaryRow ? displays.stableId(primaryRow) : null
    let originalPrimaryId: string | null = primarySid?.id ?? null
    if (originalPrimaryId === tvId) {
      await logger.info('TV was already primary. Will restore to first desktop monitor instead.', {
        fallback: desktopIds[0],
      })
      originalPrimaryId = desktopIds[0] ?? null
    } else if (originalPrimaryId !== null && !desktopIdSet.has(originalPrimaryId)) {
      await logger.info(
        'Current primary is an unknown monitor. Defaulting to first desktop monitor for restore.',
        {
          captured: originalPrimaryId,
          fallback: desktopIds[0],
        },
      )
      originalPrimaryId = desktopIds[0] ?? null
    } else if (originalPrimaryId === null) {
      originalPrimaryId = desktopIds[0] ?? null
    }

    snapshot = {
      audioCommandLineId: currentAudio?.commandLineId ?? null,
      audioLabel: currentAudio?.name ?? '(unknown)',
      originalPrimaryId,
    }

    try {
      await displays.enableMonitors([tvId])
    } catch (err) {
      await logger.error('Failed to enable TV.', { err: String(err), tvId })
      return
    }

    try {
      await displays.setPrimary(tvId)
    } catch (err) {
      await logger.warn('Failed to set TV as primary display.', { err: String(err), tvId })
    }

    try {
      await audio.setDefault(config.audio.gamingDeviceId)
    } catch (err) {
      await logger.warn('Failed to switch audio to TV output.', {
        err: String(err),
        id: config.audio.gamingDeviceId,
      })
    }

    state = 'Gaming'
    await logger.info('Switched to gaming mode.', {
      audio: snapshot.audioLabel,
      restorePrimary: originalPrimaryId,
    })
  }

  async function exitGaming(): Promise<void> {
    if (state === 'Desktop') {
      await logger.debug('Already in desktop mode, skipping.')
      return
    }

    const restorePrimary = snapshot?.originalPrimaryId ?? desktopIds[0] ?? null
    if (restorePrimary) {
      try {
        await displays.setPrimary(restorePrimary)
      } catch (err) {
        await logger.warn('Failed to restore primary display.', { err: String(err), id: restorePrimary })
      }
    } else {
      await logger.warn('No primary display to restore; skipping.')
    }

    try {
      await displays.disableMonitorsWithVerify([tvId])
    } catch (err) {
      await logger.warn('Failed to disable TV.', { err: String(err), tvId })
    }

    if (snapshot?.audioCommandLineId) {
      try {
        const devices = await audio.enumerate()
        const stillPresent = devices.some(d => d.commandLineId === snapshot!.audioCommandLineId)
        if (stillPresent) {
          await audio.setDefault(snapshot.audioCommandLineId)
        } else {
          await logger.warn('Previous audio device is no longer available. Leaving audio unchanged.', {
            id: snapshot.audioCommandLineId,
          })
        }
      } catch (err) {
        await logger.warn('Failed to restore audio device.', { err: String(err) })
      }
    }

    state = 'Desktop'
    snapshot = null
    await logger.info('Switched back to desktop mode.')
  }

  return {
    onSteamOpen: () => serialize(enterGaming),
    onSteamClose: () => serialize(exitGaming),
  }
}
