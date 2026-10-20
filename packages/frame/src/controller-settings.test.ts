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
    await controller.load(deck('off'))
    controller.setCaptionsVisible(true)
    expect(controller.state.captionsVisible).toBe(false)
    await controller.load(deck('on'))
    controller.setCaptionsVisible(false)
    expect(controller.state.captionsVisible).toBe(true)
    await controller.load(deck('viewer'))
    controller.setCaptionsVisible(false)
    expect(controller.state.captionsVisible).toBe(false)
  })

  test('the controller captions option overrides the deck policy', async () => {
    const forced = new DeckController({ hash: null, persist: false, captions: 'viewer' })
    await forced.load(deck('off'))
    expect(forced.state.captionsVisible).toBe(true)
    forced.setCaptionsVisible(false)
    expect(forced.state.captionsVisible).toBe(false)

    const locked = new DeckController({ hash: null, persist: false, captions: 'on' })
    await locked.load(deck('viewer'))
    locked.setCaptionsVisible(false)
    expect(locked.state.captionsVisible).toBe(true)
  })

  test('player options apply before and after a deck loads', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    controller.setPlayerOptions({ playback: 'continuous', captions: 'off' })
    await controller.load({ ...deck('viewer'), playback: 'segmented' })
    expect(controller.state.playback).toBe('continuous')
    expect(controller.state.captionsVisible).toBe(false)

    controller.setPlayerOptions({ playback: undefined, captions: 'on' })
    expect(controller.state.playback).toBe('segmented')
    expect(controller.state.captionsVisible).toBe(true)
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
    await first.load(deck('viewer'))
    first.setMuted(true)
    first.setCaptionsVisible(false)
    const second = new DeckController({ hash: null })
    await second.load(deck('viewer'))
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
    await controller.load(deck('viewer'))
    expect(controller.state.muted).toBe(false)
    expect(controller.state.captionsVisible).toBe(true)
    expect(() => controller.setMuted(true)).not.toThrow()
  })
})
