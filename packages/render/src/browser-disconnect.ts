import type { Browser } from 'playwright-core'
import { browserExited } from './errors.ts'

export function raceBrowserDisconnect<T>(browser: Browser, settled: boolean, watching: (stop: () => void) => void, work: () => Promise<T>): Promise<T> {
  if (settled) return Promise.resolve(undefined as T)
  let rejectDisconnect!: (error: Error) => void
  const disconnected = new Promise<never>((_, reject) => {
    rejectDisconnect = reject
  })
  const reject = () => rejectDisconnect(browserExited())
  browser.on('disconnected', reject)
  // Listen before checking so an exit between taking the browser and inspecting it cannot be missed.
  if (!browser.isConnected()) reject()
  watching(() => browser.off('disconnected', reject))
  return Promise.race([work(), disconnected])
}
