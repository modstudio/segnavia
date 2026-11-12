import { afterEach, describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { DeckController, type ResolvedContent } from './controller.ts'
import { slideIndexById, syncControllerHash } from './controller-navigation.ts'

const deck = (ids: string[]) =>
  Deck.parse({
    title: 'Deck',
    slides: ids.map((id) => ({ id, content: { kind: 'html' as const, html: `<p>${id}</p>` } })),
  })

describe('slide id navigation', () => {
  test('finds a slide index by id', () => {
    const loaded = deck(['a', 'b', 'c'])
    expect(slideIndexById(loaded, 'b')).toBe(1)
    expect(slideIndexById(loaded, 'missing')).toBeUndefined()
  })

  test('navigates with the same events as go', async () => {
    const byId = new DeckController({ hash: null, persist: false })
    const byIndex = new DeckController({ hash: null, persist: false })
    await byId.loadDeckValue(deck(['a', 'b', 'c']))
    await byIndex.loadDeckValue(deck(['a', 'b', 'c']))
    const idEvents: string[] = []
    const indexEvents: string[] = []
    for (const type of ['change', 'slide']) {
      byId.addEventListener(type, () => idEvents.push(type))
      byIndex.addEventListener(type, () => indexEvents.push(type))
    }

    expect(await byId.goToSlide('c')).toBe(true)
    await byIndex.go(2)

    expect(byId.state.index).toBe(2)
    expect(idEvents).toEqual(indexEvents)
  })

  test('does nothing for an unknown id', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.loadDeckValue(deck(['a', 'b']))
    const events: string[] = []
    for (const type of ['change', 'slide']) controller.addEventListener(type, () => events.push(type))

    expect(await controller.goToSlide('missing')).toBe(false)

    expect(controller.state.index).toBe(0)
    expect(events).toEqual([])
  })

  test('does nothing without a loaded deck', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    expect(await controller.goToSlide('a')).toBe(false)
  })

  test('reports when a newer navigation supersedes the target slide', async () => {
    const pending = Promise.withResolvers<ResolvedContent>()
    const resolving = Promise.withResolvers<void>()
    const controller = new DeckController({
      hash: null,
      persist: false,
      resolveSlide: (slide) => {
        if (slide.id !== 'b') return slide.content
        resolving.resolve()
        return pending.promise
      },
    })
    await controller.loadDeckValue(deck(['a', 'b', 'c']))

    const target = controller.goToSlide('b')
    await resolving.promise
    await controller.go(2)
    pending.resolve({ kind: 'html', html: '<p>b</p>' })

    expect(await target).toBe(false)
    expect(controller.state.slide?.id).toBe('c')
  })

  test('uses the id position from a newly loaded deck', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.loadDeckValue(deck(['a', 'b', 'c']))
    expect(await controller.goToSlide('b')).toBe(true)
    expect(controller.state.index).toBe(1)

    await controller.loadDeckValue(deck(['c', 'a', 'b']))
    expect(await controller.goToSlide('b')).toBe(true)

    expect(controller.state.index).toBe(2)
  })

  test('drops navigation when the deck changes while its guard is pending', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.loadDeckValue(deck(['a', 'b', 'c']))
    const pending = Promise.withResolvers<void>()
    controller.addNavigationGuard(() => pending.promise)

    const loading = controller.loadDeckValue(deck(['x', 'y', 'z']))
    const navigating = controller.goToSlide('c')
    pending.resolve()
    await Promise.all([loading, navigating])

    expect(await navigating).toBe(false)
    expect(controller.state.slide?.id).toBe('x')
  })
})

test('a refused hash change restores the current slide without navigating', async () => {
  const controller = new DeckController({ hash: null, persist: false })
  await controller.loadDeckValue(deck(['a', 'b']))
  let restores = 0
  syncControllerHash(controller, 1, false, () => restores++)
  expect(controller.state.index).toBe(0)
  expect(restores).toBe(1)
})

describe('controller reloads', () => {
  test('keeps the selected slide by id when it moves', async () => {
    const controller = new DeckController({ hash: null })
    await controller.loadDeckValue(deck(['a', 'b', 'c']))
    await controller.go(2)
    await controller.loadDeckValue(deck(['c', 'a', 'b']))
    expect(controller.state.index).toBe(0)
    expect(controller.state.slide?.id).toBe('c')
  })

  test('keeps the old position, clamped to the new last slide, when the selected id is removed', async () => {
    const controller = new DeckController({ hash: null })
    await controller.loadDeckValue(deck(['a', 'b', 'c']))
    await controller.go(2)
    await controller.loadDeckValue(deck(['a', 'b']))
    expect(controller.state.index).toBe(1)
    expect(controller.state.slide?.id).toBe('b')
  })

  test("lands on the slide that takes a removed middle slide's position", async () => {
    const controller = new DeckController({ hash: null })
    await controller.loadDeckValue(deck(['a', 'b', 'c', 'd']))
    await controller.go(1)
    await controller.loadDeckValue(deck(['a', 'c', 'd']))
    expect(controller.state.index).toBe(1)
    expect(controller.state.slide?.id).toBe('c')
  })

  test('contentFor resolves a neighbor without navigating', async () => {
    const controller = new DeckController({ hash: null })
    await controller.loadDeckValue(deck(['a', 'b']))
    expect(await controller.contentFor(1)).toEqual({ kind: 'html', html: '<p>b</p>' })
    expect(controller.state.index).toBe(0)
  })
})

describe('page keys', () => {
  test('space is not a deck key and ends stay bounded', async () => {
    const controller = new DeckController({ hash: null, keys: 'page' })
    await controller.loadDeckValue(deck(['a', 'b']))
    expect(controller.key(' ')).toBeNull()
    await controller.previous()
    expect(controller.state.index).toBe(0)
    await controller.go(1)
    await controller.next()
    expect(controller.state.index).toBe(1)
  })

  test('letter shortcuts do not fire from editable targets', () => {
    const controller = new DeckController({ hash: null, keys: 'page', persist: false })
    let prevented = false
    const event = {
      defaultPrevented: false,
      key: 'm',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: () => {
        prevented = true
      },
    } as unknown as KeyboardEvent
    ;(controller as unknown as { onPageKey: (event: KeyboardEvent) => void }).onPageKey(event)
    expect(controller.state.muted).toBe(false)
    expect(prevented).toBe(false)
  })
})

describe('in-window presentation', () => {
  // Restore the descriptor itself: redefining a missing document as a value would leave it read-only for later files.
  const realDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')

  afterEach(() => {
    if (realDocument) Object.defineProperty(globalThis, 'document', realDocument)
    else Reflect.deleteProperty(globalThis, 'document')
  })

  test('sets state, locks and restores overflow, and Escape exits', () => {
    const body = { style: { overflow: 'scroll' } }
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } })
    const attributes = new Set<string>()
    const element = {
      dataset: new Proxy(
        {},
        {
          set: (_target, key) => {
            attributes.add(String(key))
            return true
          },
        },
      ),
      removeAttribute: (name: string) => attributes.delete(name.replace(/^data-/, '')),
    } as unknown as HTMLElement
    const controller = new DeckController({ hash: null, keys: 'page' })
    controller.present(element)
    expect(controller.state.presenting).toBe(true)
    expect(body.style.overflow).toBe('hidden')
    expect(attributes.has('presenting')).toBe(true)
    controller.key('Escape')
    expect(controller.state.presenting).toBe(false)
    expect(body.style.overflow).toBe('scroll')
    expect(attributes.has('presenting')).toBe(false)
  })

  test('destroy restores a presentation', () => {
    const body = { style: { overflow: 'clip' } }
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } })
    const element = { dataset: {}, removeAttribute: () => {} } as unknown as HTMLElement
    const controller = new DeckController({ hash: null })
    controller.present(element)
    controller.destroy()
    expect(controller.state.presenting).toBe(false)
    expect(body.style.overflow).toBe('clip')
  })
})
