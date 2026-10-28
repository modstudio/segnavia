import type { Browser } from 'playwright-core'
import { rendererClosed } from './errors.ts'

export function keepBrowser(launch: () => Promise<Browser>): { browser(): Promise<Browser>; close(): Promise<void> } {
  let live: Browser | undefined
  let launching: Promise<Browser> | undefined
  let closed = false

  const adopt = (instance: Browser): Browser => {
    instance.on('disconnected', () => {
      if (live === instance) live = undefined
    })
    if (!closed) live = instance
    return instance
  }

  const browser = async (): Promise<Browser> => {
    if (closed) throw rendererClosed()
    if (live) return live
    if (!launching) {
      launching = launch()
        .then(adopt)
        .finally(() => {
          launching = undefined
        })
    }
    const instance = await launching
    if (closed) throw rendererClosed()
    return instance
  }

  const close = async (): Promise<void> => {
    closed = true
    const pending = launching
    const instance = live
    live = undefined
    launching = undefined
    if (instance) {
      await instance.close()
      return
    }
    if (!pending) return
    const launched = await pending.catch(() => undefined)
    if (launched) await launched.close()
  }

  return { browser, close }
}
