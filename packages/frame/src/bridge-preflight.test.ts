import { expect, test } from 'bun:test'
import { bridgeForHost, MESSAGE } from './bridge.ts'

test('a composer slot fit is cached and readiness posts the slot-fit message once', async () => {
  const messages: unknown[] = []
  let ready = () => {}
  const settled = new Promise<void>((resolve) => (ready = resolve))
  const element = {
    getAttribute: () => 'name:refuse',
    getClientRects: () => [{}],
    clientWidth: 10,
    clientHeight: 10,
    scrollWidth: 20,
    scrollHeight: 10,
    style: {},
  }
  const document = {
    addEventListener: () => {},
    fonts: null,
    images: [],
    readyState: 'complete',
    documentElement: { getBoundingClientRect: () => ({ height: 0 }), getClientRects: () => [{}] },
    getAnimations: () => [],
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector === '[data-slot-overflow]' ? [element] : []),
  }
  const parent = {
    postMessage: (message: { type?: string }) => {
      messages.push(message)
      if (message.type === MESSAGE.ready) ready()
    },
  }
  const window = { addEventListener: () => {}, getComputedStyle: () => ({ fontSize: '16px' }) } as {
    addEventListener: () => void
    getComputedStyle: () => { fontSize: string }
    segnaviaSlotFit?: (done: () => void) => void
  }
  Function(
    'document',
    'parent',
    'window',
    'MutationObserver',
    'setTimeout',
    'clearTimeout',
    bridgeForHost({ reportHeight: false, bridgeForHost: true }),
  )(
    document,
    parent,
    window,
    undefined,
    () => 1,
    () => {},
  )
  window.segnaviaSlotFit?.(() => {})
  await settled
  expect(messages.filter((message) => (message as { type?: string }).type === MESSAGE.slotFit)).toEqual([
    { type: MESSAGE.slotFit, slots: { name: 'overflowed' } },
  ])
})

test('a non-composed bridge does not expose composer slot fit', () => {
  expect(bridgeForHost({ reportHeight: false })).not.toContain('window.segnaviaSlotFit')
})
