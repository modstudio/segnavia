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
  test('resolves once without emitting controller events', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    let resolutions = 0
    controller.resolveSlide = () => ({ kind: 'url', src: `minted-${++resolutions}.html` })
    await controller.load(deck)
    let changes = 0
    let slides = 0
    controller.addEventListener('change', () => changes++)
    controller.addEventListener('slide', () => slides++)
    const result = await controller.refreshContent()
    expect(resolutions).toBe(2)
    expect(controller.state.content).toEqual({ kind: 'url', src: 'minted-2.html' })
    expect(result).toBe('refreshed')
    expect(changes).toBe(0)
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
    expect(await refreshing).toBe('superseded')
    expect(controller.state.index).toBe(1)
    expect(controller.state.content).toEqual({ kind: 'url', src: 'b.html' })
  })

  test('reports a current refresh failure without pausing playback', async () => {
    let resolutions = 0
    const controller = new DeckController({
      hash: null,
      persist: false,
      resolveSlide: () => {
        if (++resolutions === 1) return { kind: 'url', src: 'shown.html' }
        throw new Error('refresh failed')
      },
      clock: () => ({
        word: () => null,
        ended: () => false,
        elapsed: () => 0,
        progress: () => 0,
        pause() {},
        resume() {},
        seek() {},
        muted: false,
        stop() {},
      }),
      schedule: () => () => {},
    })
    await controller.load({
      title: 'Deck',
      slides: [
        {
          id: 'a',
          content: { kind: 'html', html: '<p>A</p>' },
          narration: { text: 'A', words: [{ text: 'A', startMs: 0, endMs: 100 }], durationMs: 100, audio: null, live: false, cues: [] },
        },
      ],
    })
    await controller.play()
    let detail: unknown
    controller.addEventListener('error', (event) => {
      detail = (event as CustomEvent).detail
    })

    expect(await controller.refreshContent()).toBe('failed')
    expect(detail).toEqual({ index: 0, message: 'refresh failed' })
    expect(controller.state.playing).toBeTrue()
  })

  test('a refresh rejection after a show starts is superseded without an error', async () => {
    const pending = Promise.withResolvers<{ kind: 'url'; src: string }>()
    let firstSlideResolutions = 0
    const controller = new DeckController({
      hash: null,
      persist: false,
      resolveSlide: (slide) => {
        if (slide.id === 'a' && ++firstSlideResolutions === 2) return pending.promise
        return { kind: 'url', src: `${slide.id}.html` }
      },
    })
    await controller.load(deck)
    let errors = 0
    controller.addEventListener('error', () => errors++)
    const refreshing = controller.refreshContent()
    const going = controller.go(1)
    pending.reject(new Error('stale failure'))

    expect(await refreshing).toBe('superseded')
    await going
    expect(errors).toBe(0)
    expect(controller.state.index).toBe(1)
  })

  test('the latest overlapping refresh is the only one that commits', async () => {
    const first = Promise.withResolvers<{ kind: 'url'; src: string }>()
    const second = Promise.withResolvers<{ kind: 'url'; src: string }>()
    let resolutions = 0
    const controller = new DeckController({
      hash: null,
      persist: false,
      resolveSlide: () => {
        resolutions++
        if (resolutions === 2) return first.promise
        if (resolutions === 3) return second.promise
        return { kind: 'url', src: 'shown.html' }
      },
    })
    await controller.load(deck)
    const earlier = controller.refreshContent()
    const later = controller.refreshContent()
    second.resolve({ kind: 'url', src: 'latest.html' })
    expect(await later).toBe('refreshed')
    first.resolve({ kind: 'url', src: 'stale.html' })
    expect(await earlier).toBe('refreshed')
    expect(controller.state.content).toEqual({ kind: 'url', src: 'latest.html' })
  })

  test('does nothing without a resolver', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.load(deck)
    const content = controller.state.content
    let changes = 0
    controller.addEventListener('change', () => changes++)
    expect(await controller.refreshContent()).toBe('refreshed')
    expect(controller.state.content).toBe(content)
    expect(changes).toBe(0)
  })
})
