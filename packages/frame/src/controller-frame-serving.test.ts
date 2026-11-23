import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import type { ServedFrameDocument } from './frame-write.ts'

test('constructor injection installs the frame-serving seam', () => {
  const serveFrame = (_document: ServedFrameDocument) => '/frames/constructor'
  const controller = new DeckController({ hash: null, persist: false, serveFrame })
  expect(controller.serveFrame).toBe(serveFrame)
})

test('setting frame serving emits only after a deck is loaded', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  let changes = 0
  controller.addEventListener('change', () => changes++)

  controller.serveFrame = () => '/frames/before-load'
  expect(changes).toBe(0)

  await controller.loadDeckValue({ title: 'Frame serving', slides: [{ id: 'one', content: { kind: 'html', html: '<p>One</p>' } }] })
  changes = 0
  controller.serveFrame = () => '/frames/loaded'
  expect(changes).toBe(1)
})
