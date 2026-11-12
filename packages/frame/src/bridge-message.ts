import {
  boundComposeProgress,
  boundPreflightReport,
  type ComposeProgress,
  type FontFailure,
  type PreflightProfile,
  type PreflightReport,
} from '@segnavia/format'
import { boundedFontReportMessage } from './font-load.ts'

export type SlotFitState = 'fit' | 'shrunk' | 'overflowed' | 'unmeasured'

export interface FontFailureDetail {
  failures: FontFailure[]
}

interface FrameMessageFields {
  type: string
  key?: string
  text?: string
  height?: number
  animated?: boolean
  lengthMs?: number | null
  slots?: Record<string, SlotFitState>
  failures?: FontFailure[]
  report?: PreflightReport
}

export type FrameMessage = FrameMessageFields & ({ pages?: never; total?: never } | ComposeProgress)

export function dispatchComposeProgress(target: EventTarget, message: FrameMessage | null): boolean {
  if (message?.pages === undefined || message.total === undefined) return false
  target.dispatchEvent(new CustomEvent('composeprogress', { detail: { pages: message.pages, total: message.total }, bubbles: true, composed: true }))
  return true
}

export function dispatchFontFailures(target: EventTarget, message: FrameMessage | null): void {
  if (message?.failures) {
    const detail: FontFailureDetail = { failures: message.failures }
    target.dispatchEvent(new CustomEvent('fontfailure', { detail, bubbles: true, composed: true }))
  }
}

export function dispatchPreflight(target: EventTarget, message: FrameMessage | null): boolean {
  if (!message?.report) return false
  target.dispatchEvent(new CustomEvent('preflight', { detail: message.report, bubbles: true, composed: true }))
  return true
}

function preflightMessage(data: Record<string, unknown>, type: string, profile: PreflightProfile): FrameMessage | null {
  if (data.type !== type || !('report' in data)) return null
  const report = data.report as { issues?: unknown; facts?: unknown; omitted?: unknown; coverage?: unknown } | undefined
  return {
    type,
    report: boundPreflightReport({ entries: report?.issues, facts: report?.facts, omitted: report?.omitted, coverage: report?.coverage }, profile),
  }
}

function bookPlaceMessage(data: Record<string, unknown>, type: string): FrameMessage | null {
  return data.type === type && typeof data.key === 'string' && data.key.length <= 256 ? { type, key: data.key } : null
}

interface MessageTypes {
  key: string
  bookPlace: string
  composeFailure: string
  composeProgress: string
  fontFailures: string
  preflight: string
  height: string
  ready: string
  slotFit: string
  animation: string
}

export function slotFitMessageData(data: unknown, slotFit = 'segnavia:slot-fit'): { type: string; slots: Record<string, SlotFitState> } | null {
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== slotFit) return null
  const slots = (data as { slots?: unknown }).slots
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return null
  const entries = Object.entries(slots)
  const valid = new Set<unknown>(['fit', 'shrunk', 'overflowed', 'unmeasured'])
  if (entries.length > 200 || entries.some(([key, state]) => typeof key !== 'string' || !valid.has(state))) return null
  return { type: slotFit, slots: Object.fromEntries(entries) as Record<string, SlotFitState> }
}

function presentationMessage(data: Record<string, unknown>, types: MessageTypes): FrameMessage | null {
  if (data.type === types.height && typeof data.height === 'number' && Number.isFinite(data.height)) return { type: types.height, height: data.height }
  if (data.type === types.ready) return { type: types.ready }
  const fit = slotFitMessageData(data, types.slotFit)
  if (fit) return fit
  if (
    data.type === types.animation &&
    typeof data.animated === 'boolean' &&
    (data.lengthMs === null || (typeof data.lengthMs === 'number' && Number.isFinite(data.lengthMs) && data.lengthMs >= 0))
  )
    return { type: types.animation, animated: data.animated, lengthMs: data.lengthMs }
  return null
}

export function messageFromFrames(
  event: MessageEvent,
  frame: HTMLIFrameElement | Iterable<HTMLIFrameElement> | null,
  types: MessageTypes,
  relayedKeys: readonly string[],
  composeFailureLimit: number,
  preflightProfile: PreflightProfile,
): FrameMessage | null {
  const frames = frame && Symbol.iterator in Object(frame) ? [...(frame as Iterable<HTMLIFrameElement>)] : frame ? [frame as HTMLIFrameElement] : []
  if (!frames.some((candidate) => event.source === candidate.contentWindow)) return null
  const data = event.data
  if (!data || typeof data !== 'object') return null
  if (data.type === types.key && typeof data.key === 'string' && relayedKeys.includes(data.key)) return { type: types.key, key: data.key }
  const place = bookPlaceMessage(data as Record<string, unknown>, types.bookPlace)
  if (place) return place
  const preflight = preflightMessage(data as Record<string, unknown>, types.preflight, preflightProfile)
  if (preflight) return preflight
  if (data.type === types.composeProgress) {
    const progress = boundComposeProgress(data)
    if (progress) return { type: types.composeProgress, ...progress }
  }
  const bounded = boundedFontReportMessage(data, types, composeFailureLimit)
  if (bounded) return bounded
  return presentationMessage(data as Record<string, unknown>, types)
}
