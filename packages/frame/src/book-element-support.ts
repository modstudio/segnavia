import { BOOK_LAYOUTS, type BookLayout } from './book-presentation.ts'
import { dispatchFontFailures, MESSAGE } from './bridge.ts'
import type { FrameMessage } from './bridge-message.ts'

export function bookSourceUrl(src: string): URL {
  try {
    return new URL(src)
  } catch {
    return new URL(src, location.href)
  }
}

export function reportBookError(element: HTMLElement, reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason)
  element.dispatchEvent(new CustomEvent('error', { detail: { message } }))
}

export function showBookLayoutFrames(frames: Iterable<HTMLIFrameElement>, layout: BookLayout) {
  for (const frame of frames) {
    const shown = frame.dataset.segnaviaBookLayout === layout
    frame.hidden = !shown
    frame.style.display = shown ? 'block' : 'none'
  }
}

export function bookLayoutFrame(frames: Iterable<HTMLIFrameElement>, layout: BookLayout): HTMLIFrameElement | null {
  return Array.from(frames).find((frame) => frame.dataset.segnaviaBookLayout === layout) ?? null
}

export function clearBookCollections(...collections: Array<{ clear: () => void }>) {
  for (const collection of collections) collection.clear()
}

export function acceptedBookLayout(value: string | null): BookLayout | undefined {
  return value === null ? 'pages' : BOOK_LAYOUTS.find((layout) => layout === value)
}

export function restoreBookLayoutAttribute(element: HTMLElement, previous: string | null) {
  if (previous === null) element.removeAttribute('layout')
  else element.setAttribute('layout', previous)
}

export function handleBookFontFailures(target: EventTarget, message: FrameMessage, generation: string | undefined, currentGeneration: string): boolean {
  if (message.type !== MESSAGE.fontFailures) return false
  if (generation === currentGeneration) dispatchFontFailures(target, message)
  return true
}

export interface BookComposeFailureState {
  failed: Map<BookLayout, string>
  ready: Set<BookLayout>
  pending: Set<BookLayout>
  switchPlaces: Map<BookLayout, string | undefined>
  fallbacks: Map<BookLayout, BookLayout>
  handoffTo?: BookLayout
  cancelHandoff: () => void
  restore: (layout: BookLayout) => void
  report: (text: string) => void
}

export type BookComposeFailureDecision =
  | { action: 'ignore' }
  | { action: 'handled' }
  | { action: 'fail'; text: string; fallback?: BookLayout; cancelHandoff: boolean }

export function decideBookComposeFailure(
  message: { type: string; text?: string },
  layout: BookLayout | undefined,
  failed: boolean,
  fallback: BookLayout | undefined,
  handoffTo: BookLayout | undefined,
): BookComposeFailureDecision {
  if (message.type !== MESSAGE.composeFailure || !layout || typeof message.text !== 'string') return { action: 'ignore' }
  if (failed) return { action: 'handled' }
  return { action: 'fail', text: message.text, fallback, cancelHandoff: handoffTo === layout }
}

export function handleBookComposeFailure(message: { type: string; text?: string }, layout: BookLayout | undefined, state: BookComposeFailureState): boolean {
  const decision = decideBookComposeFailure(
    message,
    layout,
    layout ? state.failed.has(layout) : false,
    layout ? state.fallbacks.get(layout) : undefined,
    state.handoffTo,
  )
  if (decision.action === 'ignore') return false
  if (decision.action === 'handled' || !layout) return true
  state.failed.set(layout, decision.text)
  state.ready.delete(layout)
  state.pending.delete(layout)
  state.switchPlaces.delete(layout)
  state.fallbacks.delete(layout)
  if (decision.cancelHandoff) state.cancelHandoff()
  if (decision.fallback) state.restore(decision.fallback)
  state.report(decision.text)
  return true
}
