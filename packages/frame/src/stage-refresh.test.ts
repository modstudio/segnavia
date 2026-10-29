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
const { StageFrameRebuilder } = await import('./stage-rebuild.ts')
const { SegnaviaStage } = await import('./stage.ts')

function stageHarness(controller: InstanceType<typeof DeckController>, mountedFrame = true) {
  const rendered: string[] = []
  let mounted = mountedFrame
  const stage = {
    isConnected: true,
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
      hasMountedFrame: () => mounted,
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
    rebuildFrames: (SegnaviaStage.prototype as unknown as { rebuildFrames(): void }).rebuildFrames,
    update: (SegnaviaStage.prototype as unknown as { update(state: DeckState): void }).update,
  }
  Object.assign(stage, {
    frameRebuilder: new StageFrameRebuilder(
      stage.pool,
      () => stage.attached,
      () => stage.isConnected,
      (state) => stage.update(state),
    ),
  })
  return { rendered, stage }
}

test('setting slots rebuilds a mounted shown frame with freshly resolved content', async () => {
  let resolutions = 0
  const controller = new DeckController({
    hash: null,
    resolveSlide: () => ({ kind: 'url', src: `minted-${++resolutions}.html` }),
  })
  await controller.load({ title: 'Deck', slides: [{ id: 'shown', content: { kind: 'url', src: 'authored.html' } }] })
  const { rendered, stage } = stageHarness(controller)
  stage.update(controller.state)

  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(stage, undefined)
  await Bun.sleep(0)

  expect(resolutions).toBe(2)
  expect(rendered).toEqual(['minted-1.html', 'minted-2.html'])
})

test('a failed refresh rebuilds the shown frame from its last resolved content', async () => {
  let resolutions = 0
  const controller = new DeckController({
    hash: null,
    resolveSlide: () => {
      if (++resolutions === 1) return { kind: 'url', src: 'last-resolved.html' }
      throw new Error('spent resolver failed')
    },
  })
  await controller.load({ title: 'Deck', slides: [{ id: 'shown', content: { kind: 'url', src: 'authored.html' } }] })
  const { rendered, stage } = stageHarness(controller)
  stage.update(controller.state)

  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(stage, undefined)
  await Bun.sleep(0)

  expect(rendered).toEqual(['last-resolved.html', 'last-resolved.html'])
})

test('rebuilding while the shown slide is an incoming mounted frame refreshes it', async () => {
  let resolutions = 0
  const controller = new DeckController({
    hash: null,
    resolveSlide: () => ({ kind: 'url', src: `pending-${++resolutions}.html` }),
  })
  await controller.load({ title: 'Deck', slides: [{ id: 'incoming', content: { kind: 'url', src: 'authored.html' } }] })
  const { rendered, stage } = stageHarness(controller, true)

  stage.rebuildFrames()
  await Bun.sleep(0)

  expect(resolutions).toBe(2)
  expect(rendered).toEqual(['pending-2.html'])
})

test('two stages rebuilding one controller both use the latest refresh', async () => {
  const earlier = Promise.withResolvers<{ kind: 'url'; src: string }>()
  const later = Promise.withResolvers<{ kind: 'url'; src: string }>()
  let resolutions = 0
  const controller = new DeckController({
    hash: null,
    resolveSlide: () => {
      resolutions++
      if (resolutions === 2) return earlier.promise
      if (resolutions === 3) return later.promise
      return { kind: 'url', src: 'shown.html' }
    },
  })
  await controller.load({ title: 'Deck', slides: [{ id: 'shown', content: { kind: 'url', src: 'authored.html' } }] })
  const first = stageHarness(controller)
  const second = stageHarness(controller)
  first.stage.update(controller.state)
  second.stage.update(controller.state)

  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(first.stage, undefined)
  Object.getOwnPropertyDescriptor(SegnaviaStage.prototype, 'slots')?.set?.call(second.stage, undefined)
  later.resolve({ kind: 'url', src: 'latest.html' })
  await Bun.sleep(0)
  earlier.resolve({ kind: 'url', src: 'stale.html' })
  await Bun.sleep(0)

  expect(first.rendered).toEqual(['shown.html', 'latest.html'])
  expect(second.rendered).toEqual(['shown.html', 'latest.html'])
})
