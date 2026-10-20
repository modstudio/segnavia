import { describe, expect, test } from 'bun:test'
import { Board } from './board.ts'

const valid = {
  title: 'References',
  direction: 'ltr' as const,
  items: [{ id: 'deck', kind: 'deck' as const, address: 'decks/one.json', x: 10, y: 20, width: 320 }],
  labels: [{ id: 'caption', text: 'First deck', x: 10, y: 0 }],
  sections: [{ id: 'group', title: 'Group', rectangle: { x: 0, y: 0, width: 400, height: 300 }, items: ['deck'] }],
}

function refusal(input: unknown): string {
  const result = Board.safeParse(input)
  expect(result.success).toBe(false)
  return result.error?.issues.map((issue) => issue.message).join('\n') ?? ''
}

describe('Board', () => {
  test('parses the board value', () => {
    expect(Board.parse(valid)).toEqual(valid)
  })

  test('refuses section rows that disagree with items or end in null', () => {
    expect(refusal({ ...valid, sections: [{ ...valid.sections[0], rows: [['other']] }] })).toContain('section "group" rows disagree with items at "deck"')
    expect(refusal({ ...valid, sections: [{ ...valid.sections[0], rows: [['deck', null]] }] })).toContain('section "group" row 0 ends in null')
  })

  test('refuses an id duplicated across lists and says what clears it', () => {
    const message = refusal({ ...valid, labels: [{ ...valid.labels[0], id: 'deck' }] })
    expect(message).toContain('id "deck" is duplicated')
    expect(message).toContain('use a unique id')
  })

  test('refuses an unknown item kind and says what clears it', () => {
    const message = refusal({ ...valid, items: [{ ...valid.items[0], kind: 'board' }] })
    expect(message).toContain('item kind is unknown')
    expect(message).toContain('use deck, page, paper, book, image or shot')
  })

  test('refuses a non-positive item width and says what clears it', () => {
    const message = refusal({ ...valid, items: [{ ...valid.items[0], width: 0 }] })
    expect(message).toContain('item width is not positive')
    expect(message).toContain('greater than zero')
  })

  test('refuses a section member that is not an item id and says what clears it', () => {
    const message = refusal({ ...valid, sections: [{ ...valid.sections[0], items: ['missing'] }] })
    expect(message).toContain('section member "missing" is not a board item id')
    expect(message).toContain('existing item')
  })

  test('refuses an empty address and says what clears it', () => {
    const message = refusal({ ...valid, items: [{ ...valid.items[0], address: '' }] })
    expect(message).toContain('item address is empty')
    expect(message).toContain('non-empty address')
  })
})
