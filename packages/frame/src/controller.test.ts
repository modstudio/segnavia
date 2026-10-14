import { describe, expect, test } from 'bun:test'
import { type Narration, Shot } from '@segnavia/format'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'

// A clock the test moves by hand, and a scheduler that runs a tick only when
// the test asks, so the controller is driven without a browser or real time.
function harness(options: { playback?: 'step' | 'continuous'; persist?: boolean } = {}) {
  const clocks: Array<{ word: number | null; ended: boolean; elapsed: number; muted: boolean; pauses: number; resumes: number }> = []
  let pending: (() => void) | null = null
  const controller = new DeckController({
    hash: null,
    ...options,
    clock: (slide): Clock => {
      const narration = slide.narration
      const state = { word: null as number | null, ended: false, elapsed: 0, muted: false, pauses: 0, resumes: 0 }
      clocks.push(state)
      return {
        word: () => state.word,
        ended: () => state.ended,
        elapsed: () => state.elapsed,
        progress: () => (state.ended ? 1 : (state.word ?? 0) / (narration?.words.length ?? 1)),
        pause: () => {
          state.pauses++
        },
        resume: () => {
          state.resumes++
        },
        seek: (ms) => {
          state.elapsed = ms
        },
        get muted() {
          return state.muted
        },
        set muted(value) {
          state.muted = value
        },
        stop: () => {},
      }
    },
    schedule: (tick) => {
      pending = tick
      return () => {
        pending = null
      }
    },
  })
  const tick = async () => {
    const run = pending
    pending = null
    run?.()
    await Bun.sleep(0)
  }
  return { controller, clocks, tick }
}

const words = (text: string) => text.split(' ').map((word, i) => ({ text: word, startMs: i * 100, endMs: i * 100 + 80 }))
const narration = (text: string, cues: Narration['cues'] = []) => ({ text, words: words(text), durationMs: 1000, audio: null, live: false, cues })
const shot = Shot.parse({
  key: 's',
  title: 'S',
  file: 's.png',
  size: { width: 1280, height: 720 },
  scale: 2,
  capturedAt: 'now',
  annotations: [{ ring: null, badge: null, arrow: null }],
})
const deck = {
  title: 'T',
  slides: [
    { id: 'a', content: { kind: 'html', html: '<p>a</p>' } },
    { id: 'b', content: { kind: 'shot', src: 's.png', shot }, narration: narration('choose new class', [{ word: 1, annotation: 0 }]) },
    { id: 'c', content: { kind: 'html', html: '<p>c</p>' }, narration: narration('then create') },
    { id: 'd', content: { kind: 'html', html: '<p>d</p>' } },
  ],
}

describe('deck controller', () => {
  test('play runs through playing slides and stops at the next static one', async () => {
    const { controller, clocks, tick } = harness()
    await controller.load(deck)
    await controller.play()
    expect(controller.state.index).toBe(1)
    expect(controller.state.playing).toBe(true)
    ;(clocks[0] as { ended: boolean }).ended = true
    await tick()
    expect(controller.state.index).toBe(2)
    expect(controller.state.playing).toBe(true)
    ;(clocks[1] as { ended: boolean }).ended = true
    await tick()
    expect(controller.state.index).toBe(3)
    expect(controller.state.playing).toBe(false)
  })

  test('an annotation shows from its cue word, and all show once paused', async () => {
    const { controller, clocks, tick } = harness()
    await controller.load(deck)
    await controller.go(1)
    await controller.play()
    ;(clocks[0] as { word: number | null }).word = 0
    await tick()
    expect(controller.state.shown).toEqual([])
    ;(clocks[0] as { word: number | null }).word = 1
    await tick()
    expect(controller.state.shown).toEqual([0])
    controller.pause()
    expect(controller.state.shown).toEqual([0])
  })

  test('pause preserves position and play resumes the same clock', async () => {
    const { controller, clocks, tick } = harness()
    await controller.load(deck)
    await controller.go(1)
    await controller.play()
    const clock = clocks[0]
    if (!clock) throw new Error('clock was not created')
    clock.elapsed = 400
    clock.word = 1
    await tick()
    controller.pause()
    expect(controller.state.slideElapsedMs).toBe(400)
    expect(controller.state.progress).toBeGreaterThan(0)
    await controller.play()
    expect(clocks).toHaveLength(1)
    expect(clock.pauses).toBe(1)
    expect(clock.resumes).toBe(1)
  })

  test('seek moves across slides and within one slide', async () => {
    const { controller, clocks } = harness()
    await controller.load({
      title: 'T',
      slides: [
        { id: 'a', content: { kind: 'html', html: '' }, holdMs: 500 },
        { id: 'b', content: { kind: 'html', html: '' }, narration: narration('hello') },
      ],
    })
    await controller.seek(750)
    expect(controller.state.index).toBe(1)
    expect(controller.state.slideElapsedMs).toBe(250)
    expect(controller.state.elapsedMs).toBe(750)
    await controller.seek(900)
    expect(controller.state.index).toBe(1)
    expect(clocks.at(-1)?.elapsed).toBe(400)
  })

  test('hold slides advance and untimed slides stop in either playback mode', async () => {
    for (const playback of ['step', 'continuous'] as const) {
      const { controller, clocks, tick } = harness({ playback })
      await controller.load({
        title: 'T',
        slides: [
          { id: 'a', content: { kind: 'html', html: '' }, holdMs: 50 },
          { id: 'b', content: { kind: 'html', html: '' } },
          { id: 'c', content: { kind: 'html', html: '' }, holdMs: 50 },
        ],
      })
      await controller.play()
      const clock = clocks[0]
      if (!clock) throw new Error('clock was not created')
      clock.ended = true
      await tick()
      expect(controller.state.index).toBe(1)
      expect(controller.state.playing).toBe(false)
      expect(controller.state.playback).toBe(playback)
      await controller.play()
      expect(controller.state.index).toBe(2)
      expect(controller.state.playing).toBe(true)
    }
  })

  test('mute changes sound without changing the clock position', async () => {
    const { controller, clocks } = harness()
    await controller.load({ title: 'T', slides: [{ id: 'a', content: { kind: 'html', html: '' }, holdMs: 500 }] })
    await controller.play()
    const clock = clocks[0]
    if (!clock) throw new Error('clock was not created')
    clock.elapsed = 200
    controller.setMuted(true)
    expect(clock.muted).toBe(true)
    expect(clock.elapsed).toBe(200)
  })

  test('reloading a deck resolves a referenced shot again', async () => {
    const realFetch = globalThis.fetch
    let requests = 0
    globalThis.fetch = (async () => {
      requests++
      return Response.json({ src: `shot-${requests}.png`, shot })
    }) as unknown as typeof fetch
    try {
      const { controller } = harness()
      const referenced = { title: 'T', slides: [{ id: 'a', content: { kind: 'shot-ref', href: 'shot.json' } }] }
      await controller.load(referenced, 'https://example.com/deck.json')
      expect(controller.state.content).toMatchObject({ kind: 'shot', src: 'https://example.com/shot-1.png' })
      await controller.load(referenced)
      expect(controller.state.content).toMatchObject({ kind: 'shot', src: 'https://example.com/shot-2.png' })
      expect(requests).toBe(2)
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('a referenced shot refuses a cue past its resolved annotations', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
    try {
      const { controller } = harness()
      const referenced = {
        title: 'T',
        slides: [
          {
            id: 'referenced',
            content: { kind: 'shot-ref', href: 'shot.json' },
            narration: narration('choose it', [{ word: 0, annotation: 1 }]),
          },
        ],
      }
      await expect(controller.load(referenced, 'https://example.com/deck.json')).rejects.toThrow(
        'Slide "referenced" has invalid cues: a cue names annotation 1, but the slide has 1.',
      )
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('a shot minted by the host refuses a cue past its annotations', async () => {
    const { controller } = harness()
    controller.resolveSlide = () => ({ kind: 'shot', src: 'minted.png', shot })
    const input = {
      title: 'T',
      slides: [
        {
          id: 'minted',
          content: { kind: 'shot-ref', href: 'shot.json' },
          narration: narration('choose it', [{ word: 0, annotation: 1 }]),
        },
      ],
    }
    await expect(controller.load(input, 'https://example.com/deck.json')).rejects.toThrow(
      'Slide "minted" has invalid cues: a cue names annotation 1, but the slide has 1.',
    )
  })

  test('failed navigation keeps the shown slide and reports the refusal once', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
    try {
      const { controller } = harness()
      const input = {
        title: 'T',
        slides: [
          { id: 'valid', content: { kind: 'html', html: '<p>valid</p>' } },
          {
            id: 'refused',
            content: { kind: 'shot-ref', href: 'shot.json' },
            narration: narration('choose it', [{ word: 0, annotation: 1 }]),
          },
        ],
      }
      const errors: Array<{ index: number; message: string }> = []
      controller.addEventListener('error', (event) => errors.push((event as CustomEvent<{ index: number; message: string }>).detail))
      await controller.load(input, 'https://example.com/deck.json')
      const before = controller.state
      await expect(controller.go(1)).rejects.toThrow('Slide "refused" has invalid cues')
      expect(controller.state.index).toBe(before.index)
      expect(controller.state.slide).toBe(before.slide)
      expect(controller.state.content).toBe(before.content)
      expect(errors).toEqual([{ index: 1, message: 'Slide "refused" has invalid cues: a cue names annotation 1, but the slide has 1.' }])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('failed navigation pauses a playing deck without changing its slide', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
    try {
      const { controller } = harness()
      const input = {
        title: 'T',
        slides: [
          { id: 'valid', content: { kind: 'html', html: '<p>valid</p>' }, narration: narration('keep playing') },
          {
            id: 'refused',
            content: { kind: 'shot-ref', href: 'shot.json' },
            narration: narration('choose it', [{ word: 0, annotation: 1 }]),
          },
        ],
      }
      const errors: Array<{ index: number; message: string }> = []
      controller.addEventListener('error', (event) => errors.push((event as CustomEvent<{ index: number; message: string }>).detail))
      await controller.load(input, 'https://example.com/deck.json')
      await controller.play()
      const before = controller.state
      await expect(controller.go(1)).rejects.toThrow('Slide "refused" has invalid cues')
      expect(controller.state.playing).toBe(false)
      expect(controller.state.index).toBe(before.index)
      expect(controller.state.slide).toBe(before.slide)
      expect(controller.state.content).toBe(before.content)
      expect(errors).toEqual([{ index: 1, message: 'Slide "refused" has invalid cues: a cue names annotation 1, but the slide has 1.' }])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test('a refused prefetch stays handled until navigation delivers it', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const controller = new DeckController({ hash: null, prefetch: true })
      const input = {
        title: 'T',
        slides: [
          { id: 'valid', content: { kind: 'html', html: '<p>valid</p>' } },
          {
            id: 'refused',
            content: { kind: 'shot-ref', href: 'shot.json' },
            narration: narration('choose it', [{ word: 0, annotation: 1 }]),
          },
        ],
      }
      await controller.load(input, 'https://example.com/deck.json')
      await Bun.sleep(0)
      expect(unhandled).toEqual([])
      await expect(controller.go(1)).rejects.toThrow('Slide "refused" has invalid cues')
    } finally {
      process.off('unhandledRejection', onUnhandled)
      globalThis.fetch = realFetch
    }
  })

  test('key navigation consumes a refusal and reports it', async () => {
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ src: 'shot.png', shot })) as unknown as typeof fetch
    try {
      const { controller } = harness()
      const input = {
        title: 'T',
        slides: [
          { id: 'valid', content: { kind: 'html', html: '<p>valid</p>' } },
          {
            id: 'refused',
            content: { kind: 'shot-ref', href: 'shot.json' },
            narration: narration('choose it', [{ word: 0, annotation: 1 }]),
          },
        ],
      }
      const errors: Array<{ index: number; message: string }> = []
      controller.addEventListener('error', (event) => errors.push((event as CustomEvent<{ index: number; message: string }>).detail))
      await controller.load(input, 'https://example.com/deck.json')
      expect(controller.key('ArrowRight')).toBe('next')
      await Bun.sleep(0)
      expect(controller.state.index).toBe(0)
      expect(errors).toEqual([{ index: 1, message: 'Slide "refused" has invalid cues: a cue names annotation 1, but the slide has 1.' }])
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('controller events', () => {
  test('slide, cue and end fire as the deck plays out', async () => {
    const { controller, clocks, tick } = harness()
    const events: string[] = []
    for (const name of ['slide', 'cue', 'end']) controller.addEventListener(name, () => events.push(name))
    await controller.load(deck)
    await controller.go(2)
    await controller.play()
    ;(clocks[0] as { ended: boolean }).ended = true
    await tick()
    await controller.next()
    expect(events.filter((e) => e === 'slide').length).toBe(3)
    expect(events).toContain('cue')
    expect(events.at(-1)).toBe('end')
  })

  test('cue fires again with the new annotations when the shown set changes', async () => {
    const { controller, clocks, tick } = harness()
    const details: Array<{ annotations: number[] | null }> = []
    controller.addEventListener('cue', (event) => details.push((event as CustomEvent<{ annotations: number[] | null }>).detail))
    await controller.load(deck)
    await controller.go(1)
    await controller.play()
    ;(clocks[0] as { word: number | null }).word = 0
    await tick()
    ;(clocks[0] as { word: number | null }).word = 1
    await tick()
    expect(details.slice(-2).map((detail) => detail.annotations)).toEqual([[], [0]])
  })
})
