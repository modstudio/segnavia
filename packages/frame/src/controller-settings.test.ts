import { afterEach, describe, expect, test } from 'bun:test'
import { DeckController } from './controller.ts'

const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

afterEach(() => {
  if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage)
  else Reflect.deleteProperty(globalThis, 'localStorage')
})

const deck = (captions?: 'on' | 'off' | 'viewer') => ({
  title: 'T',
  captions,
  slides: [{ id: 'a', content: { kind: 'html' as const, html: '' } }],
})

describe('viewer settings', () => {
  test('caption policy forces on and off, while viewer mode is settable', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.loadDeckValue(deck('off'))
    controller.setCaptionsVisible(true)
    expect(controller.state.captionsVisible).toBe(false)
    await controller.loadDeckValue(deck('on'))
    controller.setCaptionsVisible(false)
    expect(controller.state.captionsVisible).toBe(true)
    await controller.loadDeckValue(deck('viewer'))
    controller.setCaptionsVisible(false)
    expect(controller.state.captionsVisible).toBe(false)
  })

  test('the controller captions option overrides the deck policy', async () => {
    const forced = new DeckController({ hash: null, persist: false, captions: 'viewer' })
    await forced.loadDeckValue(deck('off'))
    expect(forced.state.captionsVisible).toBe(true)
    forced.setCaptionsVisible(false)
    expect(forced.state.captionsVisible).toBe(false)

    const locked = new DeckController({ hash: null, persist: false, captions: 'on' })
    await locked.loadDeckValue(deck('viewer'))
    locked.setCaptionsVisible(false)
    expect(locked.state.captionsVisible).toBe(true)
  })

  test('player options apply before and after a deck loads', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    controller.setPlayerOptions({ playback: 'continuous', captions: 'off', seek: 'furthest' })
    await controller.loadDeckValue({ ...deck('viewer'), playback: 'segmented' })
    expect(controller.state.playback).toBe('continuous')
    expect(controller.state.captionsVisible).toBe(false)
    expect(controller.state.seek).toBe('furthest')

    controller.setPlayerOptions({ playback: undefined, captions: 'on', seek: 'free' })
    expect(controller.state.playback).toBe('segmented')
    expect(controller.state.captionsVisible).toBe(true)
    expect(controller.state.seek).toBe('free')
  })

  test('mute and viewer captions persist together', async () => {
    let stored: string | null = null
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => stored,
        setItem: (_key: string, value: string) => {
          stored = value
        },
      },
    })
    const first = new DeckController({ hash: null })
    await first.loadDeckValue(deck('viewer'))
    first.setMuted(true)
    first.setCaptionsVisible(false)
    const second = new DeckController({ hash: null })
    await second.loadDeckValue(deck('viewer'))
    expect(second.state.muted).toBe(true)
    expect(second.state.captionsVisible).toBe(false)
  })

  test('throwing storage falls back to viewer defaults', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('blocked')
        },
        setItem: () => {
          throw new Error('full')
        },
      },
    })
    const controller = new DeckController({ hash: null })
    await controller.loadDeckValue(deck('viewer'))
    expect(controller.state.muted).toBe(false)
    expect(controller.state.captionsVisible).toBe(true)
    expect(() => controller.setMuted(true)).not.toThrow()
  })
})
