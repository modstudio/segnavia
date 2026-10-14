import { afterEach, describe, expect, test } from 'bun:test'
import { DeckController } from './controller.ts'

const deck = (ids: string[]) => ({
  title: 'Deck',
  slides: ids.map((id) => ({ id, content: { kind: 'html' as const, html: `<p>${id}</p>` } })),
})

describe('controller reloads', () => {
  test('keeps the selected slide by id when it moves', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(deck(['a', 'b', 'c']))
    await controller.go(2)
    await controller.load(deck(['c', 'a', 'b']))
    expect(controller.state.index).toBe(0)
    expect(controller.state.slide?.id).toBe('c')
  })

  test('clamps to the new last slide when the selected id is removed', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(deck(['a', 'b', 'c']))
    await controller.go(2)
    await controller.load(deck(['a', 'b']))
    expect(controller.state.index).toBe(1)
    expect(controller.state.slide?.id).toBe('b')
  })

  test('contentFor resolves a neighbour without navigating', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(deck(['a', 'b']))
    expect(await controller.contentFor(1)).toEqual({ kind: 'html', html: '<p>b</p>' })
    expect(controller.state.index).toBe(0)
  })
})

describe('page keys', () => {
  test('space is not a deck key and ends stay bounded', async () => {
    const controller = new DeckController({ hash: null, keys: 'page' })
    await controller.load(deck(['a', 'b']))
    expect(controller.key(' ')).toBeNull()
    await controller.previous()
    expect(controller.state.index).toBe(0)
    await controller.go(1)
    await controller.next()
    expect(controller.state.index).toBe(1)
  })
})

describe('in-window presentation', () => {
  const realDocument = globalThis.document

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: realDocument })
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
