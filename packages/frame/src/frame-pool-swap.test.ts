import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { BASE_CSS } from './base-style.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { initialDeckState } from './controller-types.ts'
import { installFramePoolTestDocument, FramePoolTestElement as TestElement } from './frame-pool.test-helper.ts'
import { FramePool } from './frame-pool.ts'
import type { PoolOptions } from './frame-pool-options.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => restoreDocument())

test('a loading incoming canvas is drawn beneath the outgoing canvas and promoted before release', () => {
  const deck = Deck.parse({
    title: 'Sandboxed frames',
    scripts: 'sandboxed',
    slides: [
      { id: 'one', content: { kind: 'url', src: 'one.html' } },
      { id: 'two', content: { kind: 'url', src: 'two.html' } },
    ],
  })
  const contents = [
    { kind: 'url' as const, src: 'one.html' },
    { kind: 'url' as const, src: 'two.html' },
  ]
  const stateFor = (index: number): DeckState => ({
    ...initialDeckState(),
    deck,
    index,
    slide: deck.slides[index] ?? null,
    content: contents[index] as ResolvedContent,
  })
  const host = new TestElement('host')
  host.isConnected = true
  let activeWhenReleased: string | undefined
  const pool = new FramePool(host as unknown as HTMLElement, () => {}, {
    mounted: () => {},
    released: () => {
      activeWhenReleased = host.querySelector('.segnavia-stage__canvas[data-active]')?.dataset.slideId
    },
  })
  let controllerState = stateFor(0)
  const controller = {
    get state() {
      return controllerState
    },
    url: (path: string) => new URL(path, 'https://example.test/').href,
    contentFor: async (index: number) => contents[index] as ResolvedContent,
    forgetContent: () => {},
  } as unknown as DeckController
  const options: PoolOptions = {
    neighbors: true,
    css: '',
    csp: '',
    frameTitle: () => '',
    reducedMotion: true,
    bridgeReadyTimeoutMs: 10,
    reportSlideError: () => {},
  }
  const frames: FrameRequestCallback[] = []
  Object.assign(window, { clearTimeout, setTimeout })
  Object.assign(globalThis, {
    cancelAnimationFrame: () => {},
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    },
  })

  pool.update(controllerState, controller, options)
  controllerState = stateFor(1)
  pool.update(controllerState, controller, options)

  const canvases = host.querySelectorAll('.segnavia-stage__canvas')
  const outgoing = canvases.find((canvas) => canvas.dataset.slideId === 'one') as TestElement
  const incoming = canvases.find((canvas) => canvas.dataset.slideId === 'two') as TestElement
  expect(outgoing.dataset.active).toBe('')
  expect(incoming.dataset.incoming).toBe('')
  expect(incoming.dataset.active).toBeUndefined()
  expect(incoming.inert).toBeTrue()
  expect(BASE_CSS).toContain('.segnavia-stage__canvas[data-incoming]){opacity:1;z-index:0}')
  expect(BASE_CSS).not.toMatch(/\.segnavia-stage__canvas\[data-incoming\][^{]*\{[^}]*(?:opacity:0|display:none)/)

  ;(incoming.querySelector('iframe') as unknown as TestElement).dispatch('load')
  frames.shift()?.(0)
  frames.shift()?.(0)

  expect(activeWhenReleased).toBe('two')
  expect(incoming.dataset.active).toBe('')
  expect(incoming.dataset.incoming).toBeUndefined()
  expect(incoming.inert).toBeFalse()
  pool.clear()
})
