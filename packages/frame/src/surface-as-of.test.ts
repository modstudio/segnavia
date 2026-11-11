import { expect, test } from 'bun:test'
import { Deck, Page } from '@segnavia/format'
import type { DeckState } from './controller-types.ts'

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

const { DeckController } = await import('./controller.ts')
const { EMPTY_SLOTS } = await import('./slot-render.ts')
const { SegnaviaStage } = await import('./stage.ts')
const { SegnaviaPlayer } = await import('./player.ts')
const { thumbnailHarness } = await import('./thumbnail-slot.test-helper.ts')

function asOfSetter(element: object, property: 'anchors' | 'asOf' | 'moment', value: unknown): void {
  for (let prototype = Object.getPrototypeOf(element); prototype; prototype = Object.getPrototypeOf(prototype)) {
    const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set
    if (setter) {
      setter.call(element, value)
      return
    }
  }
  throw new Error(`No ${property} setter was found.`)
}

function stageHarness(controller: InstanceType<typeof DeckController>) {
  const html: string[] = []
  const days: unknown[] = []
  const stage = {
    isConnected: true,
    attached: controller,
    slotPreparation: undefined,
    slotDeck: null,
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: undefined,
    selectionRequests: new Map(),
    authoringRefusesScripts: false,
    neighbors: false,
    transition: undefined,
    css: '',
    cspExtra: '',
    origins: [],
    frameTitle: () => '',
    bridgeReadyTimeoutMs: 10_000,
    pool: {
      hasMountedFrame: () => false,
      clear() {},
      update(state: DeckState, _controller: unknown, options: { slots: typeof EMPTY_SLOTS }) {
        if (state.content?.kind === 'html') html.push(options.slots.apply(state.content.html))
      },
    },
    frameRebuilder: { rebuild: () => stage.update(controller.state) },
    style: { setProperty() {} },
    dataset: {},
    querySelector: () => null,
    cancelSlotPreparation: (SegnaviaStage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    rebuildFrames: (SegnaviaStage.prototype as unknown as { rebuildFrames(): void }).rebuildFrames,
    update: (SegnaviaStage.prototype as unknown as { update(state: DeckState): void }).update,
    dispatchEvent(event: CustomEvent) {
      if (event.type === 'asof') days.push(event.detail)
      return true
    },
  }
  Object.setPrototypeOf(stage, SegnaviaStage.prototype)
  return { stage, html, days }
}

test('stage reports and binds the deck day, then reloads with a host moment', async () => {
  const controller = new DeckController({ hash: null })
  await controller.loadDeckValue({
    title: 'Dated',
    asOf: { kind: 'current' },
    slides: [{ id: 'one', content: { kind: 'html', html: '<time data-slot-value="asOf.date">placeholder</time>' } }],
  })
  const { stage, html, days } = stageHarness(controller)
  asOfSetter(stage, 'moment', Date.parse('2026-11-14T12:00:00Z'))
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(days).toEqual([{ date: '2026-11-14', zone: 'UTC', kind: 'current', moment: Date.parse('2026-11-14T12:00:00Z') }])
  expect(html.at(-1)).toContain('2026-11-14')

  asOfSetter(stage, 'moment', Date.parse('2026-11-15T12:00:00Z'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(days.at(-1)).toEqual({ date: '2026-11-15', zone: 'UTC', kind: 'current', moment: Date.parse('2026-11-15T12:00:00Z') })
})

test('deck and page thumbnails report their record day and deck HTML binds it', async () => {
  const deck = Deck.parse({
    title: 'Dated',
    asOf: { kind: 'fixed', date: '2026-11-14' },
    slides: [{ id: 'one', content: { kind: 'html', html: '<time data-slot-value="asOf.date">placeholder</time>' } }],
  })
  const deckHarness = thumbnailHarness(deck, {})
  await deckHarness.thumbnail.mount()
  expect(deckHarness.days).toEqual([{ date: '2026-11-14', zone: 'UTC', kind: 'fixed' }])
  expect(deckHarness.viewport.querySelector('iframe')?.srcdoc).toContain('2026-11-14')

  const page = Page.parse({ html: '<p>Page</p>', print: { paper: 'letter' }, asOf: { kind: 'fixed', date: '2026-11-16' } })
  const pageDays: unknown[] = []
  let established: unknown
  const pageThumbnail = {
    pageValue: page,
    value: null,
    designedCoverValue: undefined,
    slotOptions: undefined,
    slotPreparation: undefined,
    resolution: 0,
    isConnected: true,
    near: true,
    mountPage(value: unknown) {
      established = value
    },
    dispatchEvent(event: CustomEvent) {
      if (event.type === 'asof') pageDays.push(event.detail)
      return true
    },
    mount: deckHarness.thumbnail.mount,
  }
  await pageThumbnail.mount()
  expect(pageDays).toEqual([{ date: '2026-11-16', zone: 'UTC', kind: 'fixed' }])
  expect(established).toMatchObject({ day: { date: '2026-11-16' } })
})

test('player as-of setters forward to its stage', () => {
  const writes: Record<string, unknown> = {}
  const stage = Object.defineProperties(
    {},
    {
      anchors: { set: (value) => (writes.anchors = value) },
      asOf: { set: (value) => (writes.asOf = value) },
      moment: { set: (value) => (writes.moment = value) },
    },
  )
  const player = Object.create(SegnaviaPlayer.prototype)
  Reflect.set(player, 'stage', stage)
  const anchors = { choices: [], resolve: async () => null }
  player.anchors = anchors
  player.asOf = { zone: 'UTC' }
  player.moment = 42
  expect(writes).toEqual({ anchors, asOf: { zone: 'UTC' }, moment: 42 })
})
