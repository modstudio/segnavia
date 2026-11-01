import type { BookLayout } from './book-presentation.ts'
import { MESSAGE } from './bridge.ts'

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
  return value === null ? 'pages' : (['pages', 'flow'] as const).find((layout) => layout === value)
}

export function restoreBookLayoutAttribute(element: HTMLElement, previous: string | null) {
  if (previous === null) element.removeAttribute('layout')
  else element.setAttribute('layout', previous)
}

export function handleBookComposeFailure(
  message: { type: string; text?: string },
  layout: BookLayout | undefined,
  state: {
    failed: Map<BookLayout, string>
    ready: Set<BookLayout>
    pending: Set<BookLayout>
    switchPlaces: Map<BookLayout, string | undefined>
    fallbacks: Map<BookLayout, BookLayout>
    handoffTo?: BookLayout
    cancelHandoff: () => void
    restore: (layout: BookLayout) => void
    report: (text: string) => void
  },
): boolean {
  if (message.type !== MESSAGE.composeFailure || !layout || typeof message.text !== 'string') return false
  if (state.failed.has(layout)) return true
  state.failed.set(layout, message.text)
  state.ready.delete(layout)
  state.pending.delete(layout)
  state.switchPlaces.delete(layout)
  const fallback = state.fallbacks.get(layout)
  state.fallbacks.delete(layout)
  if (state.handoffTo === layout) state.cancelHandoff()
  if (fallback) state.restore(fallback)
  state.report(message.text)
  return true
}
