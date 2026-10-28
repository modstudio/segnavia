import type { PreparedSlots } from '@segnavia/html'
import type { Browser, BrowserContext, Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { withinBound } from './render-deadline.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { installSlotFitCapture, mergeCapturedSlotFit } from './slot-fit.ts'

export interface BrowserTabSetup {
  viewport: { width: number; height: number }
  scripts: boolean
  scale?: number
  html: string
  waitForReady: boolean
  beforeOutput?: (tab: Tab) => Promise<void>
}

export async function renderInBrowserTab<T>(
  browser: Browser,
  setup: BrowserTabSetup,
  measureSlots: PreparedSlots | undefined,
  state: { settled(): boolean; opened(context: BrowserContext): void; crashed(): void },
  body: (tab: Tab) => Promise<T>,
): Promise<T> {
  const context = await browser.newContext({
    viewport: setup.viewport,
    deviceScaleFactor: setup.scale ?? 1,
    javaScriptEnabled: setup.scripts,
    offline: true,
  })
  state.opened(context)
  if (state.settled()) {
    await context.close().catch(() => {})
    return undefined as T
  }
  if (measureSlots) await installSlotFitCapture(context)
  await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')))
  await context.routeWebSocket('**/*', (socket) => socket.close())
  const tab = await context.newPage()
  tab.on('crash', state.crashed)
  let ready: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => {
    ready = resolve
  })
  if (setup.waitForReady) await tab.exposeFunction('pageReady', () => ready?.())
  await tab.setContent(setup.html, { waitUntil: 'load' })
  if (setup.waitForReady) {
    await withinBound(PAGE_READY_BOUND_MS, readyPromise).catch(() => {
      throw new RenderRefusedError(`The page did not call window.pageReady() within ${PAGE_READY_BOUND_MS / 1000}s.`)
    })
  }
  await tab.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {})
  if (measureSlots) await mergeCapturedSlotFit(tab, measureSlots, PAGE_READY_BOUND_MS)
  await setup.beforeOutput?.(tab)
  return body(tab)
}
