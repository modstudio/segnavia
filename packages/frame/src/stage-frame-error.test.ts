import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, DeckState } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { FrameEntry } from './frame-entry.ts'
import type { PoolOptions } from './frame-pool-options.ts'
import { SlideFrameError } from './slide-frame-error.ts'
import { EMPTY_SLOTS } from './slot-render.ts'

class TestElement extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  matchMedia: () => ({ matches: false }),
  window: { addEventListener() {}, removeEventListener() {} },
})

const { SegnaviaStage } = await import('./stage.ts')

test('a neighbor bridge-ready timeout reports its slide id and current deck index', async () => {
  const shownContent = { kind: 'url' as const, src: 'shown.html' }
  const failedContent = { kind: 'url' as const, src: 'failed.html', bridge: true as const }
  const deck = Deck.parse({
    title: 'Neighbors',
    scripts: 'refuse',
    slides: [
      { id: 'first', content: { kind: 'url', src: 'first.html' } },
      { id: 'shown', content: { kind: 'url', src: 'shown.html' } },
      { id: 'failed-neighbor', content: { kind: 'url', src: 'failed.html' } },
    ],
  })
  const state: DeckState = {
    ...initialDeckState(),
    deck,
    index: 1,
    slide: deck.slides[1] ?? null,
    content: shownContent,
  }
  const events: ErrorEvent[] = []
  const stage = new TestElement() as TestElement & Record<string, unknown>
  Object.assign(stage, {
    attached: { state } as DeckController,
    slotDeck: deck,
    resolvedSlots: EMPTY_SLOTS,
    authoringRefusesScripts: false,
    css: '',
    cspExtra: '',
    frameTitle: () => '',
    bridgeReadyTimeoutMs: 2,
    neighbors: true,
    transition: undefined,
    pool: {
      update(shown: DeckState, _controller: DeckController, options: PoolOptions) {
        expect(shown.index).toBe(1)
        expect(options.neighbors).toBeTrue()
        const entry = new FrameEntry('failed-neighbor', { content: failedContent, scripts: 'refuse', css: '', cspExtra: '' }, failedContent)
        entry.markLoaded(options)
      },
    },
    style: { setProperty() {} },
    dataset: {},
    querySelector: () => null,
    update: (SegnaviaStage.prototype as unknown as { update(state: DeckState): void }).update,
  })
  stage.addEventListener('error', (event) => events.push(event as ErrorEvent))

  ;(stage.update as (state: DeckState) => void)(state)
  await Bun.sleep(5)

  expect(events).toHaveLength(1)
  expect(events[0]?.error).toBeInstanceOf(SlideFrameError)
  expect(events[0]?.error).toMatchObject({ name: 'SlideFrameError', slideId: 'failed-neighbor', index: 2 })
  expect(events[0]?.message).toContain('Slide "failed-neighbor" loaded a document that did not report ready')
})
