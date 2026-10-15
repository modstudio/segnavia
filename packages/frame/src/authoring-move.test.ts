import { describe, expect, test } from 'bun:test'
import { moveSlideOptimistically } from './authoring-move.ts'
import { DeckController } from './controller.ts'

const input = {
  title: 'Deck',
  slides: [
    { id: 'a', content: { kind: 'html' as const, html: 'A' } },
    { id: 'b', content: { kind: 'html' as const, html: 'B' } },
    { id: 'c', content: { kind: 'html' as const, html: 'C' } },
  ],
}

describe('authoring reorder', () => {
  test('updates order and preserves the selected slide identity before saving', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(input)
    await controller.go(1)
    let observed: string[] = []
    await moveSlideOptimistically(controller, 1, 0, async () => {
      observed = controller.state.deck?.slides.map((slide) => slide.id) ?? []
    })
    expect(observed).toEqual(['b', 'a', 'c'])
    expect(controller.state.slide?.id).toBe('b')
    expect(controller.state.index).toBe(0)
  })

  test('restores order and current identity when saving rejects', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(input)
    await controller.go(1)
    await expect(moveSlideOptimistically(controller, 1, 0, async () => Promise.reject(new Error('No')))).rejects.toThrow('No')
    expect(controller.state.deck?.slides.map((slide) => slide.id)).toEqual(['a', 'b', 'c'])
    expect(controller.state.slide?.id).toBe('b')
    expect(controller.state.index).toBe(1)
  })
})
