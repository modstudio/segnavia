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

  test('controller arrows and inferred language follow reading direction', async () => {
    const controller = new DeckController({ hash: null, persist: false })
    await controller.load({ ...deck, lang: 'he' })
    expect(controller.state.direction).toBe('rtl')
    expect(controller.key('ArrowLeft')).toBe('next')
    await Bun.sleep(0)
    expect(controller.state.index).toBe(1)
  })
})
