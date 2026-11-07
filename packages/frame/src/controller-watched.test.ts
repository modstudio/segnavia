import { expect, test } from 'bun:test'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'
import type { SeekPolicy } from './navigation-limit.ts'

const timedDeck = (count = 1) => ({
  title: 'Watched',
  slides: Array.from({ length: count }, (_, index) => ({ id: String(index), content: { kind: 'html' as const, html: '' }, holdMs: 1000 })),
})

function harness(options: { completeAt?: number; seek?: SeekPolicy } = {}) {
  const clocks: Array<{ elapsed: number; ended: boolean }> = []
  let pending: (() => void) | null = null
  const controller = new DeckController({
    hash: null,
    persist: false,
    ...options,
    clock: (): Clock => {
      const value = { elapsed: 0, ended: false }
      clocks.push(value)
      return {
        word: () => null,
        ended: () => value.ended,
        elapsed: () => value.elapsed,
        progress: () => value.elapsed / 1000,
        pause: () => {},
        resume: () => {},
        seek: (ms) => {
          value.elapsed = ms
        },
        muted: false,
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

test('played time accumulates while jumps add no watched time', async () => {
  const { controller, clocks, tick } = harness()
  await controller.loadDeckValue(timedDeck())
  await controller.play()
  const first = clocks[0]
  if (!first) throw new Error('clock was not created')
  first.elapsed = 200
  await tick()
  await controller.seek(400)
  expect(controller.state.watched.ms).toBe(200)
  const second = clocks.at(-1)
  if (!second) throw new Error('clock was not recreated')
  second.elapsed = 600
  await tick()
  expect(controller.state.watched.ms).toBe(400)
})

test('seeking back and replaying an already watched span does not grow watched time', async () => {
  const { controller, clocks, tick } = harness()
  await controller.loadDeckValue(timedDeck())
  await controller.play()
  const first = clocks[0]
  if (!first) throw new Error('clock was not created')
  first.elapsed = 500
  await tick()
  controller.pause()
  await controller.seek(0)
  await controller.play()
  const replay = clocks.at(-1)
  if (!replay) throw new Error('clock was not recreated')
  replay.elapsed = 500
  await tick()
  expect(controller.state.watched.ms).toBe(500)
})

test('furthest clamps seeks and refuses slide navigation before consulting guards', async () => {
  const { controller, clocks, tick } = harness({ seek: 'furthest' })
  await controller.loadDeckValue(timedDeck(2))
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 300
  await tick()
  await controller.seek(900)
  expect(controller.state.slideElapsedMs).toBe(300)
  let guards = 0
  let errors = 0
  controller.addNavigationGuard(() => {
    guards++
  })
  controller.addEventListener('error', () => errors++)
  const before = controller.state
  await controller.go(1)
  expect(controller.state).toBe(before)
  expect({ guards, errors }).toEqual({ guards: 0, errors: 0 })
})

test('furthest refuses next from a partly watched slide without consulting guards', async () => {
  const { controller, clocks, tick } = harness({ seek: 'furthest' })
  await controller.loadDeckValue(timedDeck(2))
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 300
  await tick()
  let guards = 0
  let errors = 0
  controller.addNavigationGuard(() => {
    guards++
  })
  controller.addEventListener('error', () => errors++)
  const before = controller.state
  await controller.next()
  expect(controller.state).toBe(before)
  expect(controller.state.index).toBe(0)
  expect({ guards, errors }).toEqual({ guards: 0, errors: 0 })
})

test('furthest refuses next from a partly watched last slide without ending or completing', async () => {
  const { controller, clocks, tick } = harness({ seek: 'furthest' })
  let ends = 0
  let completes = 0
  controller.addEventListener('end', () => ends++)
  controller.addEventListener('complete', () => completes++)
  await controller.loadDeckValue(timedDeck(2))
  await controller.play()
  const first = clocks[0]
  if (!first) throw new Error('clock was not created')
  first.elapsed = 1000
  first.ended = true
  await tick()
  const last = clocks.at(-1)
  if (!last || last === first) throw new Error('last slide clock was not created')
  last.elapsed = 300
  await tick()
  await controller.next()
  expect(controller.state.index).toBe(1)
  expect({ ends, completes }).toEqual({ ends: 0, completes: 0 })
})

test('the next key observes the furthest limit on a partly watched slide', async () => {
  const { controller, clocks, tick } = harness({ seek: 'furthest' })
  await controller.loadDeckValue(timedDeck(2))
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 300
  await tick()
  expect(controller.key('ArrowRight')).toBe('next')
  await Bun.sleep(0)
  expect(controller.state.index).toBe(0)
})

test('complete fires once at the threshold after the carrying change', async () => {
  const { controller, clocks, tick } = harness({ completeAt: 0.5 })
  const events: string[] = []
  controller.addEventListener('change', () => events.push(`change:${controller.state.watched.share}`))
  controller.addEventListener('complete', (event) => events.push(`complete:${(event as CustomEvent).detail.share}`))
  await controller.loadDeckValue(timedDeck())
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 500
  await tick()
  clock.elapsed = 750
  await tick()
  expect(events.filter((event) => event.startsWith('complete'))).toEqual(['complete:0.5'])
  expect(events.indexOf('complete:0.5')).toBeGreaterThan(events.indexOf('change:0.5'))
})

test('complete fires once for each loaded deck', async () => {
  const { controller, clocks, tick } = harness({ completeAt: 0.5 })
  let completes = 0
  controller.addEventListener('complete', () => completes++)
  await controller.loadDeckValue(timedDeck())
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 500
  await tick()
  expect(completes).toBe(1)

  await controller.loadDeckValue({ title: 'Untimed', slides: [{ id: 'still', content: { kind: 'html', html: '' } }] })
  expect(completes).toBe(2)
})

test('autoplay observes the final tick before furthest navigation ends', async () => {
  const { controller, clocks, tick } = harness({ seek: 'furthest' })
  let ends = 0
  controller.addEventListener('end', () => ends++)
  await controller.loadDeckValue(timedDeck())
  await controller.play()
  const clock = clocks[0]
  if (!clock) throw new Error('clock was not created')
  clock.elapsed = 1000
  clock.ended = true
  await tick()
  expect(controller.state.watched.complete).toBe(true)
  expect(ends).toBe(1)
})

test('a free skip ends without completing and an untimed slide completes once shown', async () => {
  const { controller } = harness()
  let ends = 0
  let completes = 0
  controller.addEventListener('end', () => ends++)
  controller.addEventListener('complete', () => completes++)
  await controller.loadDeckValue(timedDeck(2))
  await controller.go(1)
  await controller.next()
  expect({ ends, completes }).toEqual({ ends: 1, completes: 0 })

  await controller.loadDeckValue({ title: 'Untimed', slides: [{ id: 'still', content: { kind: 'html', html: '' } }] })
  expect(controller.state.watched).toMatchObject({ share: 1, complete: true })
  expect(completes).toBe(1)
})

test('completeAt refuses values outside (0, 1]', () => {
  for (const value of [0, -0.5, 1.1, Number.NaN])
    expect(() => new DeckController({ completeAt: value })).toThrow(`completeAt ${value} is outside the allowed range (0, 1].`)
})
