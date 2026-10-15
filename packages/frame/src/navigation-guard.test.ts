import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { setNavigationGuard } from './navigation-guard.ts'

const deck = {
  title: 'Guarded deck',
  slides: [
    { id: 'one', content: { kind: 'html' as const, html: '<h1>One</h1>' } },
    { id: 'two', content: { kind: 'html' as const, html: '<h1>Two</h1>' } },
    { id: 'three', content: { kind: 'html' as const, html: '<h1>Three</h1>' } },
  ],
}

test('concurrent navigations wait for the same running guard', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.load(deck)
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  setNavigationGuard(controller, () => pending)

  const first = controller.go(1)
  const second = controller.go(2)
  let secondSettled = false
  void second.then(() => {
    secondSettled = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(controller.state.index).toBe(0)
  expect(secondSettled).toBe(false)

  release()
  await Promise.all([first, second])
  expect(controller.state.index).not.toBe(0)
})
