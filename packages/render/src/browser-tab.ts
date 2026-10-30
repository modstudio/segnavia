import { Buffer } from 'node:buffer'
import { dependencyDecision } from '@segnavia/format'
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
  dependencyOrigins?: Iterable<string>
  dependencies?: (url: string) => Promise<{ body: Uint8Array; contentType: string } | undefined>
}

export type DependencyRouteDecision =
  | { action: 'continue' }
  | { action: 'abort' }
  | { action: 'missing'; url: string }
  | { action: 'fulfill'; body: Uint8Array; contentType: string }

export function dependencyRouteDecision(
  url: string,
  dependencyOrigins: Iterable<string> | undefined,
  answer: { body: Uint8Array; contentType: string } | undefined,
): DependencyRouteDecision {
  if (url.startsWith('data:')) return { action: 'continue' }
  if (!dependencyDecision(url, dependencyOrigins).allowed) return { action: 'abort' }
  return answer ? { action: 'fulfill', ...answer } : { action: 'missing', url }
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
  const missing = new Set<string>()
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    const approved = dependencyDecision(url, setup.dependencyOrigins).allowed
    const answer = approved ? await setup.dependencies?.(url) : undefined
    const decision = dependencyRouteDecision(url, setup.dependencyOrigins, answer)
    if (decision.action === 'continue') await route.continue()
    else if (decision.action === 'fulfill') await route.fulfill({ body: Buffer.from(decision.body), contentType: decision.contentType })
    else {
      if (decision.action === 'missing') missing.add(decision.url)
      await route.abort('blockedbyclient')
    }
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
  const tab = await context.newPage()
  tab.on('crash', state.crashed)
  let ready: (() => void) | undefined
  const readyPromise = new Promise<void>((resolve) => {
    ready = resolve
  })
  if (setup.waitForReady) await tab.exposeFunction('pageReady', () => ready?.())
  await tab.setContent(setup.html, { waitUntil: 'load' })
  if (missing.size > 0) {
    throw new RenderRefusedError(`The host cache did not answer approved dependencies: ${[...missing].join(', ')}.`)
  }
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
