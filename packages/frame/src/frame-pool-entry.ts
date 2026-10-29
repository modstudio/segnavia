import type { ContentValue } from './content-value.ts'
import { comparableContent, sameContent } from './content-value.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { FrameEntry, type FrameReadiness } from './frame-entry.ts'
import type { PoolOptions } from './frame-pool-options.ts'
import type { FrameTitle } from './frame-title.ts'
import { stageCanvas } from './stage-content.ts'

export interface FrameEvents {
  mounted: (slideId: string, content: ResolvedContent) => void
  released: (slideId: string, content: ResolvedContent) => void
}

interface AddFrameOptions {
  entries: Map<string, FrameEntry>
  events: FrameEvents
  host: HTMLElement
  index: number
  content: ResolvedContent
  state: DeckState
  controller: DeckController
  pool: PoolOptions
  mount: boolean
}

export function addFrame({ entries, events, host, index, content, state, controller, pool, mount }: AddFrameOptions): HTMLElement | null {
  const deck = state.deck
  const slide = deck?.slides[index]
  if (!deck || !slide) return null
  const existing = entries.get(slide.id)
  const comparable = comparableContent(content, (path) => controller.url(path), deck.scripts, pool.css, pool.csp)
  if (existing && canReuseFrame({ readiness: existing.ready, sameResolution: existing.content === content }, existing.value, comparable)) return existing.canvas
  const entry = new FrameEntry(slide.id, comparable, content)
  const canvas = stageCanvas(controller, deck, slide, index, content, pool.css, pool.csp, pool.frameTitle, () => entry.markLoaded(pool), pool.slots)
  entry.canvas = canvas
  entries.set(slide.id, entry)
  if (existing) {
    existing.dispose()
    existing.canvas.replaceWith(canvas)
    events.released(existing.id, existing.content)
  } else if (mount) host.append(canvas)
  if (existing || mount) events.mounted(entry.id, entry.content)
  return canvas
}

interface FrameReuseState {
  readiness: FrameReadiness
  sameResolution: boolean
}

export function canReuseFrame(state: FrameReuseState, current: ContentValue, next: ContentValue): boolean {
  return sameContent(current, next) && (state.readiness !== 'failed' || state.sameResolution)
}

export function removeFrame(entries: Map<string, FrameEntry>, controller: DeckController | null, events: FrameEvents, id: string, entry: FrameEntry) {
  entry.dispose()
  entry.canvas.remove()
  entries.delete(id)
  controller?.forgetContent(id)
  events.released(entry.id, entry.content)
}

export function syncFrames(entries: Map<string, FrameEntry>, pending: { id: string; visibleId: string } | null, state: DeckState, frameTitle: FrameTitle) {
  const deck = state.deck
  if (!deck || !state.slide) return
  for (const [index, slide] of deck.slides.entries()) {
    const canvas = entries.get(slide.id)?.canvas
    if (!canvas) continue
    const incoming = slide.id === pending?.id
    const visible = pending ? slide.id === pending.visibleId : slide.id === state.slide.id
    canvas.toggleAttribute('data-active', visible)
    canvas.toggleAttribute('data-incoming', incoming)
    canvas.setAttribute('aria-hidden', String(!visible))
    canvas.inert = !visible
    const frame = canvas.querySelector('iframe')
    if (frame) frame.title = frameTitle(deck.title, index + 1)
  }
}
