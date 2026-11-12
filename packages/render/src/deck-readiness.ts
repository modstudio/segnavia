import { BOOK_FAILURE_ATTRIBUTE } from '@segnavia/frame/book-document'
import { PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import { layoutsUsed } from '@segnavia/frame/layout'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type RenderReadiness, readinessRefusal, waitForDiagramReadiness } from './render-readiness.ts'

export async function waitForPrintReady(tab: Tab, readiness: RenderReadiness): Promise<void> {
  let waiting = true
  const printed = tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .then(
      () => true,
      () => false,
    )
  const failure = (async () => {
    while (waiting) {
      for (const frame of typeof tab.frames === 'function' ? tab.frames() : []) {
        const reason = await frame.evaluate((attribute) => document.documentElement.getAttribute(attribute), BOOK_FAILURE_ATTRIBUTE).catch(() => null)
        if (reason) return reason
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    return null
  })()
  const outcome = await Promise.race([printed.then((ready) => ({ ready, reason: null })), failure.then((reason) => ({ ready: false, reason }))])
  waiting = false
  if (outcome.reason) throw new RenderRefusedError(outcome.reason)
  if (!outcome.ready && readiness.layouts) {
    throw new RenderRefusedError(readinessRefusal(readiness, { author: true, diagrams: true, layouts: false }, SLIDES_READY_DEADLINE_MS / 1000))
  }
  await waitForDiagramReadiness(tab, readiness)
}

export function layoutsForHtml(html: string, scripts: readonly LoadedLayoutScript[]): readonly LoadedLayoutScript[] {
  const names = new Set(layoutsUsed(html))
  return scripts.filter((script) => names.has(script.name))
}
