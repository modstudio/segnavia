import type { FontFailure } from '@segnavia/format'
import { PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { type RenderReadiness, waitForDiagramReadiness } from './render-readiness.ts'

export async function waitForPrintReady(tab: Tab, readiness: RenderReadiness): Promise<void> {
  await tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .catch(() => {})
  await waitForDiagramReadiness(tab, readiness)
}

export function firstNotesPages(pageOwners: readonly number[], slideCount: number): number[] {
  return Array.from({ length: slideCount }, (_, slide) => pageOwners.indexOf(slide))
}

export function deckFontFailures(initial: readonly FontFailure[], notes: { failures: FontFailure[] } | undefined): FontFailure[] {
  return [...initial, ...(notes?.failures ?? [])]
}
