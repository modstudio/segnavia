import { PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import { layoutsUsed } from '@segnavia/frame/layout'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type RenderReadiness, readinessRefusal, waitForDiagramReadiness } from './render-readiness.ts'

export async function waitForPrintReady(tab: Tab, readiness: RenderReadiness): Promise<void> {
  const printed = await tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .then(
      () => true,
      () => false,
    )
  if (!printed && readiness.layouts) {
    throw new RenderRefusedError(readinessRefusal(readiness, { author: true, diagrams: true, layouts: false }, SLIDES_READY_DEADLINE_MS / 1000))
  }
  await waitForDiagramReadiness(tab, readiness)
}

export function layoutsForHtml(html: string, scripts: readonly LoadedLayoutScript[]): readonly LoadedLayoutScript[] {
  const names = new Set(layoutsUsed(html))
  return scripts.filter((script) => names.has(script.name))
}
