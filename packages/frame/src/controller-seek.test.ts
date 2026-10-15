import { expect, test } from 'bun:test'
import type { Slide } from '@segnavia/format'
import type { Clock } from './clock.ts'
import { DeckController } from './controller.ts'

test('a superseded seek cannot overwrite the newer seek position', async () => {
  let release: (() => void) | undefined
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  const controller = new DeckController({
    hash: null,
    resolveSlide: async (slide: Slide) => {
      if (slide.id === 'b') await delayed
      return slide.content
    },
    clock: (): Clock => {
      let elapsed = 0
      return {
        word: () => null,
        ended: () => false,
        elapsed: () => elapsed,
        progress: () => elapsed / 1000,
        pause: () => {},
        resume: () => {},
        seek: (ms) => {
          elapsed = ms
        },
        muted: false,
        stop: () => {},
      }
    },
  })
  await controller.load({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'a' }, holdMs: 1000 },
      { id: 'b', content: { kind: 'html', html: 'b' }, holdMs: 1000 },
    ],
  })
  const older = controller.seek(1400)
  await Bun.sleep(0)
  await controller.seek(100)
  release?.()
  await older
  expect(controller.state.index).toBe(0)
  expect(controller.state.slide?.id).toBe('a')
  expect(controller.state.slideElapsedMs).toBe(100)
})

test('a superseded failed seek cannot pause or report over a newer seek', async () => {
  let reject: ((error: Error) => void) | undefined
  const delayed = new Promise<never>((_, rejectPromise) => {
    reject = rejectPromise
  })
  const controller = new DeckController({
    hash: null,
    resolveSlide: async (slide: Slide) => {
      if (slide.id === 'b') return delayed
      return slide.content
    },
  })
  await controller.load({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'a' }, holdMs: 1000 },
      { id: 'b', content: { kind: 'html', html: 'b' }, holdMs: 1000 },
    ],
  })
  await controller.play()
  const errors: Array<{ index: number; message: string }> = []
  controller.addEventListener('error', (event) => errors.push((event as CustomEvent).detail))

  const older = controller.seek(1400)
  await Bun.sleep(0)
  await controller.seek(100)
  reject?.(new Error('obsolete signed URL'))
  await older

  expect(controller.state.playing).toBe(true)
  expect(controller.state.index).toBe(0)
  expect(controller.state.slide?.id).toBe('a')
  expect(errors).toEqual([])
})

test('a failed seek pauses playback and reports the target slide once', async () => {
  const controller = new DeckController({
    hash: null,
    resolveSlide: (slide, index) => {
      if (index === 1) throw new Error('signed URL expired')
      return slide.content
    },
  })
  await controller.load({
    title: 'T',
    slides: [
      { id: 'a', content: { kind: 'html', html: 'a' }, holdMs: 1000 },
      { id: 'b', content: { kind: 'html', html: 'b' }, holdMs: 1000 },
    ],
  })
  await controller.play()
  const errors: Array<{ index: number; message: string }> = []
  controller.addEventListener('error', (event) => errors.push((event as CustomEvent).detail))

  await expect(controller.seek(1400)).rejects.toThrow('signed URL expired')

  expect(controller.state.playing).toBe(false)
  expect(errors).toEqual([{ index: 1, message: 'signed URL expired' }])
})
