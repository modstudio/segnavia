import type { FontFailure } from '@segnavia/format'
import { boundedFontReportMessage } from './font-load.ts'

export type SlotFitState = 'fit' | 'shrunk' | 'overflowed'

export interface FrameMessage {
  type: string
  key?: string
  text?: string
  height?: number
  animated?: boolean
  lengthMs?: number | null
  slots?: Record<string, SlotFitState>
  failures?: FontFailure[]
}

export function dispatchFontFailures(target: EventTarget, message: FrameMessage | null): void {
  if (message?.failures) target.dispatchEvent(new CustomEvent('fontfailure', { detail: { failures: message.failures }, bubbles: true, composed: true }))
}

interface MessageTypes {
  key: string
  bookPlace: string
  composeFailure: string
  fontFailures: string
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
  const valid = new Set<unknown>(['fit', 'shrunk', 'overflowed'])
  if (entries.length > 200 || entries.some(([key, state]) => typeof key !== 'string' || !valid.has(state))) return null
  return { type: slotFit, slots: Object.fromEntries(entries) as Record<string, SlotFitState> }
}

export function messageFromFrames(
  event: MessageEvent,
  frame: HTMLIFrameElement | Iterable<HTMLIFrameElement> | null,
  types: MessageTypes,
  relayedKeys: readonly string[],
  composeFailureLimit: number,
): FrameMessage | null {
  const frames = frame && Symbol.iterator in Object(frame) ? [...(frame as Iterable<HTMLIFrameElement>)] : frame ? [frame as HTMLIFrameElement] : []
  if (!frames.some((candidate) => event.source === candidate.contentWindow)) return null
  const data = event.data as Record<string, unknown>
  if (data.type === types.key && typeof data.key === 'string' && relayedKeys.includes(data.key)) return { type: types.key, key: data.key }
  if (data.type === types.bookPlace && typeof data.key === 'string') return { type: types.bookPlace, key: data.key }
  const bounded = boundedFontReportMessage(data, types, composeFailureLimit)
  if (bounded) return bounded
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
