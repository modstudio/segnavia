import { describe, expect, test } from 'bun:test'
import { DeckController } from './controller.ts'
import { keyAction } from './keys.ts'

const deck = {
  title: 'T',
  slides: [
    { id: 'a', content: { kind: 'html' as const, html: '' } },
    { id: 'b', content: { kind: 'html' as const, html: '' } },
  ],
}

describe('keys', () => {
  test('page keys and space mean the same in either direction; arrows mirror', () => {
    expect([keyAction('ArrowRight', 'ltr'), keyAction('ArrowRight', 'rtl')]).toEqual(['next', 'previous'])
    expect([keyAction('PageDown', 'rtl'), keyAction(' ', 'rtl'), keyAction('Escape', 'ltr'), keyAction('a', 'ltr')]).toEqual(['next', 'toggle', 'exit', null])
  })

  test('viewer shortcuts toggle mute and captions while present is returned to the host', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.load({ ...deck, captions: 'viewer' })
    expect(controller.key('m')).toBe('mute')
    expect(controller.state.muted).toBe(true)
    expect(controller.key('c')).toBe('captions')
    expect(controller.state.captionsVisible).toBe(false)
    expect(controller.key('f')).toBe('present')
    expect(controller.state.presenting).toBe(false)
  })

  test('controller arrows and inferred language follow reading direction', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.load({ ...deck, lang: 'he' })
    expect(controller.state.direction).toBe('rtl')
    expect(controller.key('ArrowLeft')).toBe('next')
    await Bun.sleep(0)
    expect(controller.state.index).toBe(1)
  })
})
