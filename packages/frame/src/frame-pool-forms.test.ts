import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { installFramePoolTestDocument, FramePoolTestElement as TestElement } from './frame-pool.test-helper.ts'
import { FramePool } from './frame-pool.ts'
import type { PoolOptions } from './frame-pool-options.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
  Object.assign(window, { clearTimeout, setTimeout })
})
afterAll(() => restoreDocument())

test('form refusal participates in pending frame reuse', () => {
  const deck = Deck.parse({
    title: 'Sandboxed frames',
    scripts: 'sandboxed',
    slides: [
      { id: 'one', content: { kind: 'html', html: '<p>One</p>' } },
      { id: 'two', content: { kind: 'html', html: '<form></form>' } },
    ],
  })
  const contents = deck.slides.map((slide) => slide.content as ResolvedContent)
  const stateFor = (index: number): DeckState => ({
    ...initialDeckState(),
    deck,
    index,
    slide: deck.slides[index] ?? null,
    content: contents[index] as ResolvedContent,
  })
  const host = new TestElement('host')
  host.isConnected = true
  const pool = new FramePool(host as unknown as HTMLElement, () => {}, { mounted() {}, released() {} })
  let controllerState = stateFor(0)
  const controller = {
    get state() {
      return controllerState
    },
    url: (path: string) => path,
    contentFor: async (index: number) => contents[index] as ResolvedContent,
    forgetContent() {},
  } as unknown as DeckController
  const options: PoolOptions = {
    neighbors: true,
    css: '',
    csp: '',
    forms: 'refuse',
    frameTitle: () => '',
    reducedMotion: true,
    bridgeReadyTimeoutMs: 10,
    reportSlideError() {},
  }

  pool.update(controllerState, controller, options)
  controllerState = stateFor(1)
  pool.update(controllerState, controller, options)
  const refused = pool.frames().find((frame) => frame.closest('[data-slide-id="two"]'))
  pool.update(controllerState, controller, options)
  expect(pool.frames().find((frame) => frame.closest('[data-slide-id="two"]'))).toBe(refused)

  pool.update(controllerState, controller, { ...options, forms: undefined })
  expect(pool.frames().find((frame) => frame.closest('[data-slide-id="two"]'))).not.toBe(refused)
  expect(
    pool
      .frames()
      .find((frame) => frame.closest('[data-slide-id="two"]'))
      ?.getAttribute('sandbox'),
  ).toBe('allow-scripts allow-forms')
  pool.clear()
})
