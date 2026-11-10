import {
  boundPreflightReport,
  type PreflightProfile,
  type PreflightProfileInput,
  type PreflightReport,
  preflightRefusal,
  resolvePreflightProfile,
} from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'

export interface RenderPreflightOptions {
  profile?: PreflightProfileInput
  report?(report: PreflightReport): void
}

export function renderPreflightProfile(preflight: RenderPreflightOptions | undefined): PreflightProfile | undefined {
  return preflight === undefined ? undefined : resolvePreflightProfile(preflight.profile)
}

export function handlePreflightAttribute(attribute: string | null, profile: PreflightProfile, report?: (report: PreflightReport) => void): void {
  if (attribute === null) return
  const held = JSON.parse(attribute) as { issues?: unknown; facts?: unknown; omitted?: unknown } | null
  const bounded = boundPreflightReport({ entries: held?.issues, facts: held?.facts, omitted: held?.omitted }, profile)
  report?.(bounded)
  const refusal = preflightRefusal(bounded)
  if (refusal) throw new RenderRefusedError(refusal)
}
