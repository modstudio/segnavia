import { describe, expect, test } from 'bun:test'
import { Shot } from '@segnavia/format'
import { moveSlideOptimistically } from './authoring-move.ts'
import { DeckController } from './controller.ts'

const shot = Shot.parse({
  key: 'shot',
  title: 'Shot',
  file: 'shot.png',
  size: { width: 1280, height: 720 },
  scale: 1,
  capturedAt: 'now',
  annotations: [],
})

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

  test('restores order without saving when the optimistic reload rejects', async () => {
    let resolutions = 0
    let saves = 0
    const controller = new DeckController({
      hash: null,
      resolveSlide: () => {
        resolutions++
        if (resolutions === 2) throw new Error('Expired shot')
        return { kind: 'shot', src: 'shot.png', shot }
      },
    })
    const referenced = {
      title: 'Deck',
      slides: [
        { id: 'a', content: { kind: 'shot-ref' as const, href: 'shot.json' } },
        { id: 'b', content: { kind: 'html' as const, html: 'B' } },
      ],
    }
    await controller.load(referenced)

    await expect(
      moveSlideOptimistically(controller, 0, 1, async () => {
        saves++
      }),
    ).rejects.toThrow('Expired shot')

    expect(controller.state.deck?.slides.map((slide) => slide.id)).toEqual(['a', 'b'])
    expect(controller.state.slide?.id).toBe('a')
    expect(controller.state.index).toBe(0)
    expect(saves).toBe(0)
  })

  test('does not roll back over a newer host deck when saving rejects', async () => {
    const controller = new DeckController({ hash: null })
    await controller.load(input)
    let rejectSave = (_error: Error) => {}
    const saving = moveSlideOptimistically(
      controller,
      0,
      1,
      () => new Promise<void>((_resolve, reject) => (rejectSave = reject)),
    )
    await Promise.resolve()
    const host = {
      ...input,
      title: 'New host deck',
      slides: input.slides.map((slide) => ({ ...slide, content: { ...slide.content, html: `Host ${slide.id}` } })),
    }
    await controller.load(host)
    rejectSave(new Error('Move refused'))

    await expect(saving).rejects.toThrow('Move refused')
    expect(controller.state.deck?.title).toBe('New host deck')
    expect(controller.state.deck?.slides[0]?.content).toEqual({ kind: 'html', html: 'Host a' })
  })
})
