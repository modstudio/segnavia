import type { BookLayout } from './book-presentation.ts'

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
