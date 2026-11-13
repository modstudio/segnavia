import { expect, test } from 'bun:test'
import { boundPreflightReport, Deck, PREFLIGHT_PRESETS } from '@segnavia/format'
import type { DeckController, DeckState } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { FrameEntry } from './frame-entry.ts'
import type { PoolOptions } from './frame-pool-options.ts'
import { SlideFrameError } from './slide-frame-error.ts'
import { EMPTY_SLOTS } from './slot-render.ts'
import { surfacePreflightFor } from './surface-preflight.ts'

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
const { SegnaviaDocument } = await import('./document.ts')

const cleanReport = () => boundPreflightReport({ entries: [], facts: { pageCount: 1, pages: [], fits: [], regions: [] } }, PREFLIGHT_PRESETS.default)

test('stage surface reports incomplete slide coverage in slide units', () => {
  const shownContent = { kind: 'html' as const, html: '<p>First</p>' }
  const deck = Deck.parse({
    title: 'Coverage',
    slides: [
      { id: 'first', content: { kind: 'html', html: '<p>First</p>' } },
      { id: 'second', content: { kind: 'html', html: '<p>Second</p>' } },
    ],
  })
  const state: DeckState = {
    ...initialDeckState(),
    deck,
    index: 0,
    slide: deck.slides[0] ?? null,
    content: shownContent,
  }
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
    neighbors: false,
    transition: undefined,
    pool: { update() {} },
    style: { setProperty() {} },
    dataset: {},
    querySelector: () => null,
  })
  ;(SegnaviaStage.prototype as unknown as { update(state: DeckState): void }).update.call(stage, state)
  let received: import('@segnavia/format').PreflightReport | undefined
  stage.addEventListener('preflight', (event) => {
    received = (event as CustomEvent<import('@segnavia/format').PreflightReport>).detail
  })
  surfacePreflightFor(stage).receive('first', cleanReport())
  expect(received?.issues[0]).toMatchObject({
    subject: 'slides',
    message: 'Preflight measured 1 of 2 slides; a slide that is never laid out cannot be checked. Lay out every slide to clear this.',
  })
})

test('document surface reports incomplete page coverage in page units', () => {
  const documentElement = new TestElement() as TestElement & Record<string, unknown>
  Object.assign(documentElement, {
    pageValues: [{ slots: [] }, { slots: [] }],
    slotGeneration: 0,
    isConnected: false,
    cancelSlotPreparation() {},
    replaceChildren() {},
    style: { removeProperty() {} },
    printValue: undefined,
  })
  ;(SegnaviaDocument.prototype as unknown as { paint(): void }).paint.call(documentElement)
  let received: import('@segnavia/format').PreflightReport | undefined
  documentElement.addEventListener('preflight', (event) => {
    received = (event as CustomEvent<import('@segnavia/format').PreflightReport>).detail
  })
  surfacePreflightFor(documentElement).receive(0, cleanReport())
  expect(received?.issues[0]).toMatchObject({
    subject: 'pages',
    message: 'Preflight measured 1 of 2 pages; a page that is never laid out cannot be checked. Lay out every page to clear this.',
  })
})

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
        const entry = new FrameEntry('failed-neighbor', { content: failedContent, scripts: 'refuse', css: '', cspExtra: '', origins: '' }, failedContent)
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
