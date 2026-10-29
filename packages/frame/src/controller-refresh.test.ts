import { describe, expect, test } from 'bun:test'
import { DeckController } from './controller.ts'

const deck = {
  title: 'Deck',
  slides: [
    { id: 'a', content: { kind: 'html' as const, html: '<p>A</p>' } },
    { id: 'b', content: { kind: 'html' as const, html: '<p>B</p>' } },
  ],
}

describe('controller content refresh', () => {
  test('resolves once and emits change without a slide event', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    let resolutions = 0
    controller.resolveSlide = () => ({ kind: 'url', src: `minted-${++resolutions}.html` })
    await controller.load(deck)
    let changes = 0
    let slides = 0
    controller.addEventListener('change', () => changes++)
    controller.addEventListener('slide', () => slides++)
    await controller.refreshContent()
    expect(resolutions).toBe(2)
    expect(controller.state.content).toEqual({ kind: 'url', src: 'minted-2.html' })
    expect(changes).toBe(1)
    expect(slides).toBe(0)
  })

  test('a show started during a refresh owns the state', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    const pending = Promise.withResolvers<{ kind: 'url'; src: string }>()
    let firstSlideResolutions = 0
    controller.resolveSlide = (slide) => {
      if (slide.id === 'a' && ++firstSlideResolutions === 2) return pending.promise
      return { kind: 'url', src: `${slide.id}.html` }
    }
    await controller.load(deck)
    const refreshing = controller.refreshContent()
    await controller.go(1)
    pending.resolve({ kind: 'url', src: 'stale.html' })
    await refreshing
    expect(controller.state.index).toBe(1)
    expect(controller.state.content).toEqual({ kind: 'url', src: 'b.html' })
  })

  test('does nothing without a resolver', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.load(deck)
    const content = controller.state.content
    let changes = 0
    controller.addEventListener('change', () => changes++)
    await controller.refreshContent()
    expect(controller.state.content).toBe(content)
    expect(changes).toBe(0)
  })
})
