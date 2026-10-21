import { expect, test } from 'bun:test'
import { Deck, type SlotsOptions } from '@segnavia/format'
import { SlotFillRefusedError } from '@segnavia/html'

class TestElement extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: TestElement,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
  matchMedia: () => ({ matches: false }),
})

const { SegnaviaStage } = await import('./stage.ts')
const { SegnaviaPage } = await import('./page.ts')
const { thumbnailHarness } = await import('./thumbnail-slot.test-helper.ts')

test('page keeps authored HTML and reports a refused fill for a scripted item', () => {
  let iframe = { srcdoc: '' }
  const errors: Error[] = []
  const page = {
    isConnected: true,
    loadGeneration: 0,
    slotPreparation: undefined,
    slotOptions: { fill: { id: 'x', values: { name: 'Filled' } } } as SlotsOptions,
    cancelSlotPreparation: (SegnaviaPage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    mount() {
      iframe = { srcdoc: '' }
      return iframe
    },
    querySelector: () => iframe,
    fit() {},
    dispatchEvent(event: ErrorEvent) {
      errors.push(event.error)
      return true
    },
    load: (SegnaviaPage.prototype as unknown as { load(input: unknown): void }).load,
  }
  page.load({
    html: '<p data-slot-value="name">Authored</p>',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
  })
  expect(iframe.srcdoc).toContain('Authored')
  expect(iframe.srcdoc).not.toContain('Filled')
  expect(errors).toHaveLength(1)
  expect(errors[0]).toBeInstanceOf(SlotFillRefusedError)
})

test('deck thumbnail keeps authored content and reports a refused fill for a scripted deck', async () => {
  const deck = scriptedDeck()
  const { thumbnail, viewport, errors } = thumbnailHarness(deck, { fill: { id: 'x', values: { name: 'Filled' } } })
  await thumbnail.mount()
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('Authored')
  expect(viewport.querySelector('iframe')?.srcdoc).not.toContain('Filled')
  expect(errors[0]).toBeInstanceOf(SlotFillRefusedError)
})

test('stage renders authored content and reports a refused fill for a scripted deck', () => {
  const deck = scriptedDeck()
  const state = { deck, content: deck.slides[0]?.content, index: 0, playing: false, word: null, shown: null, direction: 'ltr' }
  const rendered: Array<{ content: { html: string } }> = []
  const errors: Error[] = []
  const stage = {
    isConnected: true,
    slotPreparation: undefined,
    cancelSlotPreparation: (SegnaviaStage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    slotDeck: null,
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: { fill: { id: 'x', values: { name: 'Filled' } } } as SlotsOptions,
    attached: { state },
    pool: {
      clear() {},
      update(value: { content: { html: string } }) {
        rendered.push(value)
      },
    },
    style: { setProperty() {} },
    dataset: {},
    authoringRefusesScripts: false,
    css: '',
    cspExtra: '',
    frameTitle: () => '',
    room: {},
    querySelector: () => null,
    dispatchEvent(event: ErrorEvent) {
      errors.push(event.error)
      return true
    },
    update: (SegnaviaStage.prototype as unknown as { update(state: unknown): void }).update,
  }
  stage.update(state)
  expect(rendered[0]?.content.html).toContain('Authored')
  expect(rendered[0]?.content.html).not.toContain('Filled')
  expect(errors[0]).toBeInstanceOf(SlotFillRefusedError)
})

function scriptedDeck() {
  return Deck.parse({
    title: 'Slots',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="name">Authored</p>' } }],
  })
}
