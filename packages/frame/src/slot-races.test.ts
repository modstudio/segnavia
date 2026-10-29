import { expect, test } from 'bun:test'
import { Deck, type SlotsOptions } from '@segnavia/format'
import { prepareSlots } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'

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
const { SegnaviaPaper } = await import('./paper.ts')
const { SegnaviaDocument } = await import('./document.ts')
const { SegnaviaPage } = await import('./page.ts')
const { thumbnailHarness, slotDeck } = await import('./thumbnail-slot.test-helper.ts')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const assetSlot = [{ key: 'logo', label: 'Logo', type: 'image' as const, required: false }]

test('page keeps its pending fill when replacement input is refused', async () => {
  const asset = deferred<string>()
  let iframe = { srcdoc: '' }
  const page = {
    isConnected: true,
    loadGeneration: 0,
    slotPreparation: undefined as AbortController | undefined,
    slotOptions: { fill: { id: 'x', values: { logo: { asset: 'logo' } } }, resolveAsset: () => asset.promise } as SlotsOptions,
    cancelSelectionRequests() {},
    cancelSlotPreparation: (SegnaviaPage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    mount() {
      iframe = { srcdoc: '' }
      return iframe
    },
    querySelector: () => iframe,
    fit() {},
    dispatchEvent() {
      return true
    },
    load: (SegnaviaPage.prototype as unknown as { load(input: unknown): void }).load,
  }
  page.load({ html: '<img data-slot-src="logo">', slots: assetSlot })
  const generation = page.loadGeneration
  const preparation = page.slotPreparation
  expect(() => page.load({ html: 1 })).toThrow()
  expect(page.loadGeneration).toBe(generation)
  expect(page.slotPreparation).toBe(preparation)
  expect(preparation?.signal.aborted).toBe(false)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(iframe.srcdoc).toContain('data:image/png;base64,AAAA')
})

test('page ignores slot fit from a filled frame after loading an unfilled sandboxed page', async () => {
  const reports: Array<{ slots: Record<string, string> }> = []
  let iframe = { srcdoc: '', contentWindow: {} }
  const page = new SegnaviaPage() as unknown as {
    load(input: unknown): void
    slots: SlotsOptions | undefined
  } & Record<string, unknown>
  Object.assign(page, {
    isConnected: true,
    slotOptions: {
      fill: { id: 'x', values: { name: 'A very long name' } },
      report: (report: { slots: Record<string, string> }) => reports.push(structuredClone(report)),
    } as SlotsOptions | undefined,
    cancelSlotPreparation: (SegnaviaPage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    mount() {
      iframe = { srcdoc: '', contentWindow: {} }
      return iframe
    },
    querySelector: () => iframe,
    fit() {},
    dispatchEvent() {
      return true
    },
  })
  page.load({
    html: '<p data-slot-value="name">Name</p>',
    scripts: 'refuse',
    slots: [{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'refuse' }],
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  page.slots = undefined
  page.load({ html: '<p>Unfilled</p>', scripts: 'sandboxed' })
  ;(page as unknown as { onMessage(event: MessageEvent): void }).onMessage({
    source: iframe.contentWindow,
    data: { type: MESSAGE.slotFit, slots: { name: 'overflowed' } },
  } as MessageEvent)
  expect(reports.at(-1)?.slots.name).toBe('filled')
  expect((page as unknown as { resolvedSlots?: unknown }).resolvedSlots).toBeUndefined()
})

test('thumbnail shows authored content while a fill is pending, then replaces it', async () => {
  const asset = deferred<string>()
  const deck = Deck.parse({
    title: 'Slots',
    slots: assetSlot,
    slides: [{ id: 'one', content: { kind: 'html', html: '<img data-slot-src="logo">' } }],
  })
  const { thumbnail, viewport } = thumbnailHarness(deck, {
    fill: { id: 'x', values: { logo: { asset: 'logo' } } },
    resolveAsset: () => asset.promise,
  })
  const mounted = thumbnail.mount()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('data-slot-src="logo"')
  asset.resolve('data:image/png;base64,AAAA')
  await mounted
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('data:image/png;base64,AAAA')
})

test('thumbnail keeps authored content and reports when applying a fill is refused', async () => {
  const { thumbnail, viewport, errors } = thumbnailHarness(slotDeck('<style data-slot-value="name">Authored</style>'), {
    fill: { id: 'x', values: { name: 'Filled' } },
  })
  await thumbnail.mount()
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('Authored')
  expect(errors).toHaveLength(1)
  expect(String(errors[0])).toContain('uses a value binding on <style>')
})

test('thumbnail never replaces current content with a stale pending fill', async () => {
  const oldAsset = deferred<string>()
  const newAsset = deferred<string>()
  const oldDeck = Deck.parse({
    title: 'Old',
    slots: assetSlot,
    slides: [{ id: 'old', content: { kind: 'html', html: '<p>Old</p><img data-slot-src="logo">' } }],
  })
  const { thumbnail, viewport } = thumbnailHarness(oldDeck, {
    fill: { id: 'old-fill', values: { logo: { asset: 'old-logo' } } },
    resolveAsset: () => oldAsset.promise,
  })
  const stale = thumbnail.mount()
  await new Promise((resolve) => setTimeout(resolve, 0))
  thumbnail.clear()
  thumbnail.value = Deck.parse({
    title: 'New',
    slots: assetSlot,
    slides: [{ id: 'new', content: { kind: 'html', html: '<p>New authored</p><img data-slot-src="logo">' } }],
  })
  thumbnail.slotOptions = {
    fill: { id: 'new-fill', values: { logo: { asset: 'new-logo' } } },
    resolveAsset: () => newAsset.promise,
  }
  const current = thumbnail.mount()
  await new Promise((resolve) => setTimeout(resolve, 0))
  oldAsset.resolve('data:image/png;base64,OLD')
  await stale
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('New authored')
  expect(viewport.querySelector('iframe')?.srcdoc).not.toContain('data:image/png;base64,OLD')
  newAsset.resolve('data:image/png;base64,NEW')
  await current
  expect(viewport.querySelector('iframe')?.srcdoc).toContain('data:image/png;base64,NEW')
})

test('stage renders the current slide when slot resolution finishes after navigation', async () => {
  const asset = deferred<string>()
  const deck = {
    title: 'Deck',
    size: { width: 400, height: 200 },
    layout: 'slides',
    scripts: 'refuse',
    slots: assetSlot,
    slides: [],
  }
  const first = { deck, content: { kind: 'html', html: '<p>First</p>' }, index: 0, playing: false, word: null, shown: null, direction: 'ltr' }
  const current = { ...first, content: { kind: 'html', html: '<p>Current</p>' }, index: 1 }
  const rendered: unknown[] = []
  const stage = {
    isConnected: true,
    slotPreparation: undefined,
    cancelSlotPreparation: (SegnaviaStage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    slotDeck: null,
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: { fill: { id: 'x', values: { logo: { asset: 'logo' } } }, resolveAsset: () => asset.promise } as SlotsOptions | undefined,
    attached: { state: first },
    pool: {
      clear() {},
      update(state: unknown) {
        rendered.push(state)
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
    update: (SegnaviaStage.prototype as unknown as { update(state: unknown): void }).update,
  }
  stage.update(first)
  stage.attached.state = current
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(rendered.at(-1)).toBe(current)
})

test('stage invalidates a pending fill when slot options are removed', async () => {
  const asset = deferred<string>()
  const deck = { title: 'Deck', size: { width: 400, height: 200 }, layout: 'slides', scripts: 'refuse', slides: [] }
  const state = (shownDeck: typeof deck) => ({
    deck: shownDeck,
    content: { kind: 'html', html: '<p>Design</p>' },
    index: 0,
    playing: false,
    word: null,
    shown: null,
    direction: 'ltr',
  })
  let renders = 0
  const reports: unknown[] = []
  const stage = {
    isConnected: true,
    slotPreparation: undefined,
    cancelSelectionRequests() {},
    cancelSlotPreparation: (SegnaviaStage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    slotDeck: null,
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: {
      declarations: assetSlot,
      fill: { id: 'x', values: { logo: { asset: 'logo' } } },
      resolveAsset: () => asset.promise,
      report: (report: unknown) => reports.push(report),
    } as SlotsOptions | undefined,
    attached: { state: state(deck) },
    pool: {
      clear() {},
      update() {
        renders++
      },
    },
    style: { setProperty() {} },
    dataset: {},
    authoringRefusesScripts: false,
    css: '',
    cspExtra: '',
    frameTitle: () => '',
    querySelector: () => null,
    update: (SegnaviaStage.prototype as unknown as { update(state: unknown): void }).update,
  }
  stage.update(stage.attached.state)
  stage.attached.state = state(deck)
  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(stage, undefined)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(renders).toBe(2)
  expect(reports).toEqual([])
})

test('paper invalidates a pending fill when slot options are removed', async () => {
  const asset = deferred<string>()
  const pages: Array<{ html: string; scripts: 'refuse'; slots?: typeof assetSlot }> = [{ html: '<img data-slot-src="logo">', scripts: 'refuse' }]
  let paints = 0
  const paper = {
    isConnected: true,
    slotPreparation: undefined,
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    pages,
    imposition: {},
    imposed: {},
    slotGeneration: 0,
    resolvedSlots: undefined,
    slotOptions: {
      declarations: assetSlot,
      fill: { id: 'x', values: { logo: { asset: 'logo' } } },
      resolveAsset: () => asset.promise,
    } as SlotsOptions | undefined,
    paintResolved() {
      paints++
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  paper.paint()
  Object.getOwnPropertyDescriptor(SegnaviaPaper.prototype, 'slots')?.set?.call(paper, undefined)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paints).toBe(2)
})

test('disconnecting paper aborts a pending fill without reporting or repainting', async () => {
  const asset = deferred<string>()
  const reports: unknown[] = []
  let paints = 0
  const paper = {
    isConnected: true,
    pages: [{ html: '<img data-slot-src="logo">', scripts: 'refuse', slots: assetSlot }],
    imposition: {},
    imposed: {},
    slotGeneration: 0,
    slotPreparation: undefined,
    resolvedSlots: undefined,
    slotOptions: {
      fill: { id: 'x', values: { logo: { asset: 'logo' } } },
      resolveAsset: () => asset.promise,
      report: (report: unknown) => reports.push(report),
    } as SlotsOptions,
    resize: { disconnect() {} },
    cancelSlotPreparation: (SegnaviaPaper.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved() {
      paints++
    },
    paint: (SegnaviaPaper.prototype as unknown as { paint(): void }).paint,
  }
  paper.paint()
  paper.isConnected = false
  ;(SegnaviaPaper.prototype as unknown as { disconnectedCallback(): void }).disconnectedCallback.call(paper)
  asset.resolve('data:image/png;base64,AAAA')
  await asset.promise
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paints).toBe(1)
  expect(reports).toEqual([])
})

test('document reports invalid bindings prepared before a page is mounted', async () => {
  const errors: ErrorEvent[] = []
  let paints = 0
  const documentViewer = {
    isConnected: true,
    pageValues: [{ html: '<source data-slot-src="logo">', scripts: 'refuse', slots: assetSlot }],
    printValue: {},
    slotOptions: { fill: { id: 'x', values: { logo: 'data:image/png;base64,AAAA' } } } as SlotsOptions,
    slotGeneration: 0,
    slotPreparation: undefined,
    filledHtml: undefined,
    observer: null,
    pageObserver: null,
    style: { removeProperty() {} },
    replaceChildren() {},
    cancelSlotPreparation: (SegnaviaDocument.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    paintResolved() {
      paints++
    },
    dispatchEvent(event: ErrorEvent) {
      errors.push(event)
      return true
    },
    paint: (SegnaviaDocument.prototype as unknown as { paint(): void }).paint,
  }
  documentViewer.paint()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(paints).toBe(1)
  expect(errors).toHaveLength(1)
  expect(errors[0]?.message).toContain('src bindings are allowed only on <img>')
})

test("document's report receives fit from a frame it owns", async () => {
  const reports: Array<{ slots: Record<string, string> }> = []
  const resolved = await prepareSlots([{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'shrink', minSize: 6 }], {
    fill: { id: 'x', values: { name: 'A very long name' } },
    report: (report) => reports.push(structuredClone(report)),
  })
  const source = {}
  const documentViewer = new SegnaviaDocument() as unknown as Record<string, unknown>
  Object.assign(documentViewer, {
    resolvedSlots: resolved,
    resolvedGeneration: 3,
    slotGeneration: 3,
    querySelectorAll: () => [{ contentWindow: source }],
  })
  ;(documentViewer as unknown as { onMessage(event: MessageEvent): void }).onMessage({
    source,
    data: { type: MESSAGE.slotFit, slots: { name: 'shrunk' } },
  } as MessageEvent)
  expect(reports.at(-1)?.slots.name).toBe('shrunk')
})
