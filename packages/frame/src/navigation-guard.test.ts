import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { deckPreservesNotes, parseDeckLoad, preserveNotesForLoad } from './deck-load-origin.ts'
import { activeNavigationGuard, addNavigationGuard, runNavigationGuard } from './navigation-guard.ts'

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
  await controller.loadDeckValue(deck)
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  addNavigationGuard(controller, () => pending)

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

test('concurrent loads have distinct provenance while awaiting one guard', async () => {
  const target = new EventTarget()
  let release = () => {}
  addNavigationGuard(
    target,
    () =>
      new Promise<void>((resolve) => {
        const active = activeNavigationGuard(target)
        if (active) preserveNotesForLoad(active, 'one')
        release = resolve
      }),
  )

  const first = runNavigationGuard(target, 'load')
  const second = runNavigationGuard(target, 'load')
  await Promise.resolve()

  expect(first).not.toBe(second)
  release()
  await Promise.all([first, second])
  expect(deckPreservesNotes(parseDeckLoad(deck, first), 'one')).toBe(true)
  expect(deckPreservesNotes(parseDeckLoad(deck, second), 'one')).toBe(false)
})

test('guards run in order and a removed guard stops running', async () => {
  const target = new EventTarget()
  const calls: string[] = []
  const removeFirst = addNavigationGuard(target, async () => {
    calls.push('first')
  })
  addNavigationGuard(target, async () => {
    calls.push('second')
  })

  await runNavigationGuard(target)
  removeFirst()
  await runNavigationGuard(target)

  expect(calls).toEqual(['first', 'second', 'second'])
})

test('the first rejecting guard takes the controller error path and stops the list', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.loadDeckValue(deck)
  const calls: string[] = []
  const errors: string[] = []
  controller.addNavigationGuard(() => {
    calls.push('first')
    throw new Error('stay here')
  })
  controller.addNavigationGuard(() => {
    calls.push('second')
  })
  controller.addEventListener('error', (event) => errors.push((event as CustomEvent).detail.message))

  await expect(controller.go(1)).rejects.toThrow('stay here')
  expect(calls).toEqual(['first'])
  expect(errors).toEqual(['stay here'])
})

test('cross-slide seek awaits the navigation guard but same-slide seek does not', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.loadDeckValue({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: '' }, holdMs: 500 },
      { id: 'b', content: { kind: 'html', html: '' }, holdMs: 500 },
    ],
  })
  let guards = 0
  let release = () => {}
  addNavigationGuard(
    controller,
    () =>
      new Promise<void>((resolve) => {
        guards++
        release = resolve
      }),
  )
  await controller.seek(250)
  expect(guards).toBe(0)
  const seeking = controller.seek(750)
  await Promise.resolve()
  expect(guards).toBe(1)
  expect(controller.state.index).toBe(0)
  release()
  await seeking
  expect(controller.state.index).toBe(1)
})

test('identifies host reloads separately from slide navigation', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.loadDeckValue(deck)
  const reasons: string[] = []
  addNavigationGuard(controller, async (reason) => {
    reasons.push(reason)
  })

  await controller.next()
  await controller.loadDeckValue(deck)

  expect(reasons).toEqual(['navigate', 'load'])
})
