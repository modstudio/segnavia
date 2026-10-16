import { expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { deckPreservesNotes, parseDeckLoad, preserveNotesForLoad } from './deck-load-origin.ts'
import { activeNavigationGuard, runNavigationGuard, setNavigationGuard } from './navigation-guard.ts'

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

test('concurrent loads have distinct provenance while awaiting one guard', async () => {
  const target = new EventTarget()
  let release = () => {}
  setNavigationGuard(
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

test('an old guard disposer does not remove its replacement', async () => {
  const target = new EventTarget()
  const calls: string[] = []
  const removeOld = setNavigationGuard(target, async () => {
    calls.push('old')
  })
  setNavigationGuard(target, async () => {
    calls.push('new')
  })

  removeOld()
  await runNavigationGuard(target)

  expect(calls).toEqual(['new'])
})

test('cross-slide seek awaits the navigation guard but same-slide seek does not', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.load({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: '' }, holdMs: 500 },
      { id: 'b', content: { kind: 'html', html: '' }, holdMs: 500 },
    ],
  })
  let guards = 0
  let release = () => {}
  setNavigationGuard(
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
  await controller.load(deck)
  const reasons: string[] = []
  setNavigationGuard(controller, async (reason) => {
    reasons.push(reason)
  })

  await controller.next()
  await controller.load(deck)

  expect(reasons).toEqual(['navigate', 'load'])
})
