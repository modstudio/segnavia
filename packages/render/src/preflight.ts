import {
  boundPreflightReport,
  type PreflightEntry,
  type PreflightProfile,
  type PreflightProfileInput,
  type PreflightReport,
  preflightRefusal,
  resolvePreflightProfile,
} from '@segnavia/format'
import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/composer'
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

export function resolveRenderPreflight(preflight: RenderPreflightOptions | undefined): ComposedPreflight | undefined {
  if (preflight === undefined) return undefined
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
