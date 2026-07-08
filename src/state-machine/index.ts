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
      await logger.debug('sm.open.noop-already-gaming')
      return
    }

    let currentAudio: audio.AudioDevice | null = null
    try {
      currentAudio = await audio.getDefaultRender()
    } catch (err) {
      await logger.warn('sm.open.audio-enum-failed', { err: String(err) })
    }

    let primaryId: string | null = null
    try {
      const primary = await displays.getPrimary()
      primaryId = primary?.id ?? null
    } catch (err) {
      await logger.warn('sm.open.primary-enum-failed', { err: String(err) })
    }

    let originalPrimaryId: string | null = primaryId
    if (originalPrimaryId === tvId) {
      await logger.info('sm.open.primary-was-tv-blocklisted', {
        tvId,
        fallback: desktopIds[0],
      })
      originalPrimaryId = desktopIds[0] ?? null
    } else if (originalPrimaryId !== null && !desktopIdSet.has(originalPrimaryId)) {
      await logger.info('sm.open.primary-unknown-using-default', {
        captured: originalPrimaryId,
        fallback: desktopIds[0],
      })
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
      await logger.error('sm.open.tv-enable-failed', { err: String(err), tvId })
      return
    }

    try {
      await displays.setPrimary(tvId)
    } catch (err) {
      await logger.warn('sm.open.setprimary-tv-failed', { err: String(err), tvId })
    }

    try {
      await audio.setDefault(config.audio.gamingDeviceId)
    } catch (err) {
      await logger.warn('sm.open.audio-set-failed', {
        err: String(err),
        id: config.audio.gamingDeviceId,
      })
    }

    state = 'Gaming'
    await logger.info('gaming.enter', {
      snapshotAudio: snapshot.audioLabel,
      restorePrimary: originalPrimaryId,
    })
  }

  async function exitGaming(): Promise<void> {
    if (state === 'Desktop') {
      await logger.debug('sm.close.noop-already-desktop')
      return
    }

    const restorePrimary = snapshot?.originalPrimaryId ?? desktopIds[0] ?? null
    if (restorePrimary) {
      try {
        await displays.setPrimary(restorePrimary)
      } catch (err) {
        await logger.warn('sm.close.setprimary-restore-failed', {
          err: String(err),
          id: restorePrimary,
        })
      }
    } else {
      await logger.warn('sm.close.no-primary-to-restore')
    }

    try {
      await displays.disableMonitors([tvId])
    } catch (err) {
      await logger.warn('sm.close.tv-disable-failed', { err: String(err), tvId })
    }

    if (snapshot?.audioCommandLineId) {
      try {
        const devices = await audio.enumerate()
        const stillPresent = devices.some(d => d.commandLineId === snapshot!.audioCommandLineId)
        if (stillPresent) {
          await audio.setDefault(snapshot.audioCommandLineId)
        } else {
          await logger.warn('sm.close.audio-gone', { id: snapshot.audioCommandLineId })
        }
      } catch (err) {
        await logger.warn('sm.close.audio-restore-failed', { err: String(err) })
      }
    }

    state = 'Desktop'
    snapshot = null
    await logger.info('gaming.exit')
  }

  return {
    onSteamOpen: () => serialize(enterGaming),
    onSteamClose: () => serialize(exitGaming),
  }
}
