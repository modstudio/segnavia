import { COMPOSE_FAILURE_ATTRIBUTE, PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type RenderReadiness, readinessRefusal, waitForDiagramReadiness } from './render-readiness.ts'

async function watchForLayoutFailure(tab: Tab, waiting: () => boolean): Promise<string | null> {
  while (waiting()) {
    for (const frame of typeof tab.frames === 'function' ? tab.frames() : []) {
      const reason = await frame.evaluate((attribute) => document.documentElement.getAttribute(attribute), COMPOSE_FAILURE_ATTRIBUTE).catch(() => null)
      if (reason) return reason
    }
    if (waiting()) await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return null
}
export async function waitForPrintReady(tab: Tab, readiness: RenderReadiness): Promise<void> {
  const printed = tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .then(
      () => true,
      () => false,
    )
  let outcome: { ready: boolean; reason: string | null }
  if (readiness.layouts) {
    let waiting = true
    const failure = watchForLayoutFailure(tab, () => waiting)
    outcome = await Promise.race([printed.then((ready) => ({ ready, reason: null })), failure.then((reason) => ({ ready: false, reason }))])
    waiting = false
    await failure
  } else {
    outcome = { ready: await printed, reason: null }
  }
  if (outcome.reason) throw new RenderRefusedError(outcome.reason)
  if (!outcome.ready && readiness.layouts) {
    throw new RenderRefusedError(readinessRefusal(readiness, { author: true, diagrams: true, layouts: false }, SLIDES_READY_DEADLINE_MS / 1000))
  }
  await waitForDiagramReadiness(tab, readiness)
}
