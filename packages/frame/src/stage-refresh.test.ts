import { expect, test } from 'bun:test'
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

test('setting slots rebuilds a mounted shown frame with freshly resolved content', async () => {
  let resolutions = 0
  const controller = new DeckController({
    hash: null,
    resolveSlide: () => ({ kind: 'url', src: `minted-${++resolutions}.html` }),
  })
  await controller.load({ title: 'Deck', slides: [{ id: 'shown', content: { kind: 'url', src: 'authored.html' } }] })
  const rendered: string[] = []
  let mounted = false
  const stage = {
    attached: controller,
    slotPreparation: undefined,
    slotDeck: controller.state.deck,
    slotGeneration: 0,
    resolvedSlots: EMPTY_SLOTS,
    slotOptions: undefined,
    authoringRefusesScripts: false,
    css: '',
    cspExtra: '',
    frameTitle: () => '',
    bridgeReadyTimeoutMs: 10_000,
    pool: {
      shownFrame: () => (mounted ? ({} as HTMLIFrameElement) : null),
      clear() {
        mounted = false
      },
      update(state: DeckState) {
        if (state.content?.kind === 'url') rendered.push(state.content.src)
        mounted = true
      },
    },
    style: { setProperty() {} },
    dataset: {},
    querySelector: () => null,
    cancelSelectionRequests() {},
    cancelSlotPreparation: (SegnaviaStage.prototype as unknown as { cancelSlotPreparation(): void }).cancelSlotPreparation,
    shownFrameMounted: (SegnaviaStage.prototype as unknown as { shownFrameMounted(controller: unknown): boolean }).shownFrameMounted,
    rebuild: (SegnaviaStage.prototype as unknown as { rebuild(controller: unknown, sameController: boolean): void }).rebuild,
    update: (SegnaviaStage.prototype as unknown as { update(state: DeckState): void }).update,
  }
  controller.addEventListener('change', (event) => stage.update((event as CustomEvent<DeckState>).detail))
  stage.update(controller.state)
  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(stage, undefined)
  await Bun.sleep(0)
  expect(resolutions).toBe(2)
  expect(rendered).toEqual(['minted-1.html', 'minted-2.html'])
})
