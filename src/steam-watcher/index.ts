import { EventEmitter } from 'node:events'
import { readBigPictureValue } from './registry.ts'
import { logger } from '../logger/index.ts'

export type WatcherEvent = 'open' | 'close'

export interface SteamWatcher {
  start(): void
  stop(): void
  on(event: WatcherEvent, listener: () => void): void
}

export interface WatcherOptions {
  pollMs: number
  debounceMs: number
}

export function createSteamWatcher(opts: WatcherOptions): SteamWatcher {
  const emitter = new EventEmitter()
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  let lastFired: 0 | 1 = 0
  let pendingValue: 0 | 1 | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let currentPollMs = opts.pollMs
  let steamMissingLogged = false

  async function tick(): Promise<void> {
    if (!running) return
    let raw: number
    try {
      raw = await readBigPictureValue()
      currentPollMs = opts.pollMs
    } catch (err) {
      currentPollMs = 5000
      await logger.warn('watcher.reg-failed', { err: String(err) })
      schedule()
      return
    }

    const value: 0 | 1 = raw === 0 ? 0 : 1
    if (raw === 0 && !steamMissingLogged) {
      steamMissingLogged = true
      await logger.info('watcher.steam-key-missing-or-zero')
    }

    if (value === lastFired) {
      pendingValue = null
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    } else if (value !== pendingValue) {
      pendingValue = value
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (pendingValue !== null && pendingValue !== lastFired) {
          const next = pendingValue
          lastFired = next
          pendingValue = null
          emitter.emit(next === 1 ? 'open' : 'close')
        }
        debounceTimer = null
      }, opts.debounceMs)
    }

    schedule()
  }

  function schedule(): void {
    if (!running) return
    timer = setTimeout(tick, currentPollMs)
  }

  return {
    start() {
      if (running) return
      running = true
      void tick()
    },
    stop() {
      running = false
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    },
    on(event, listener) {
      emitter.on(event, listener)
    },
  }
}
