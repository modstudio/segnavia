import {
  appendSlotOversetEntries,
  boundPreflightReport,
  type FontFailure,
  fontMissingEntries,
  type PreflightEntry,
  type PreflightProfile,
  type PreflightProfileInput,
  type PreflightReport,
  preflightEnabled,
  preflightRefusal,
  resolvePreflightProfile,
} from '@segnavia/format'
import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'

export interface RenderPreflightOptions {
  profile?: PreflightProfileInput
  report?(report: PreflightReport): void
}

export interface ComposedPreflight {
  profile: PreflightProfile
  seed: PreflightEntry[]
  report?(report: PreflightReport): void
}

export interface SurfacePreflightCapture {
  readonly fontFailures: readonly FontFailure[]
  readonly slotFits: readonly Record<string, string>[]
}

export interface SurfacePreflight {
  capture(position?: { readonly index?: number; readonly folio?: string }): (capture: SurfacePreflightCapture) => void
  complete(): void
}

export function surfacePreflight(preflight: ComposedPreflight | undefined, total: number): SurfacePreflight | undefined {
  if (!preflight || !preflightEnabled(preflight.profile)) return undefined
  const captures: Array<SurfacePreflightCapture & { order: number; location?: { readonly folio?: string } }> = []
  return {
    capture: (position) => (capture) =>
      captures.push({
        ...capture,
        order: position?.index ?? -1,
        ...(position?.folio === undefined ? {} : { location: { folio: position.folio } }),
      }),
    complete: () => {
      const entries: PreflightEntry[] = []
      captures.sort((left, right) => left.order - right.order)
      for (const capture of captures) {
        for (const slots of capture.slotFits) appendSlotOversetEntries(slots, entries, capture.location)
        for (const entry of fontMissingEntries(capture.fontFailures, capture.location)) {
          if (!entries.some((held) => held.check === entry.check && held.subject === entry.subject)) entries.push(entry)
        }
      }
      const report = boundPreflightReport(
        { entries, facts: { pageCount: total, pages: [], fits: [] }, coverage: { measured: total, total } },
        preflight.profile,
      )
      preflight.report?.(report)
      const refusal = preflightRefusal(report)
      if (refusal) throw new RenderRefusedError(refusal)
    },
  }
}

export function resolveRenderPreflight(preflight: RenderPreflightOptions | undefined): ComposedPreflight | undefined {
  if (preflight === undefined) return undefined
  if (preflight.report !== undefined && typeof preflight.report !== 'function') {
    throw new RenderRefusedError(
      'The preflight option needs a report function; pass preflight: { profile, report(report) {} }, or omit report to clear this refusal.',
    )
  }
  try {
    return { profile: resolvePreflightProfile(preflight.profile), seed: [], report: preflight.report }
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}

export function withPreflightSeed(preflight: ComposedPreflight | undefined, seed: PreflightEntry[] | undefined): ComposedPreflight | undefined {
  return preflight === undefined ? undefined : { ...preflight, seed: seed ?? [] }
}

export function handlePreflightAttribute(attribute: string | null, profile: PreflightProfile, report?: (report: PreflightReport) => void): void {
  if (attribute === null) return
  let held: { issues?: unknown; facts?: unknown; omitted?: unknown } | null
  try {
    held = JSON.parse(attribute) as typeof held
  } catch {
    throw new RenderRefusedError('The composed preflight report could not be read; compose the document again to clear this refusal.')
  }
  const bounded = boundPreflightReport({ entries: held?.issues, facts: held?.facts, omitted: held?.omitted }, profile)
  report?.(bounded)
  const refusal = preflightRefusal(bounded)
  if (refusal) throw new RenderRefusedError(refusal)
}

export async function awaitPreflightReport(tab: Tab, preflight: ComposedPreflight | undefined): Promise<void> {
  if (!preflight) return
  const attribute = await tab.evaluate((name) => document.documentElement.getAttribute(name), PREFLIGHT_ATTRIBUTE)
  handlePreflightAttribute(attribute, preflight.profile, preflight.report)
}
