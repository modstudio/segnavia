import { describe, expect, test } from 'bun:test'
import type { PaginateUnit } from './paginate-types.ts'
import { paginateVariables } from './paginate-variables.ts'

const declarations = [
  { name: 'start', kind: 'text' as const, from: 'content' as const, pick: 'start' as const },
  { name: 'first', kind: 'text' as const, from: 'content' as const, pick: 'first' as const },
  { name: 'last', kind: 'text' as const, from: 'content' as const, pick: 'last' as const },
]

function unit(index: number, variables: Array<{ name: string; value: string }> = []): PaginateUnit {
  return {
    flowId: 'flow',
    index,
    top: index * 10,
    bottom: index * 10 + 10,
    refs: [],
    block: {
      kind: 'text',
      tag: 'p',
      position: { chapter: 1, block: 1 },
      lines: [
        { top: 0, bottom: 10 },
        { top: 10, bottom: 20 },
      ],
      variables: variables.map((variable) => ({ ...variable, line: index })),
    },
  }
}

describe('paginateVariables', () => {
  test('start carries a value set on an earlier page', () => {
    const earlier = paginateVariables([unit(0, [{ name: 'start', value: 'Earlier' }])], {}, declarations)
    expect(paginateVariables([unit(1)], earlier.carried, declarations).values.start?.start).toBe('Earlier')
  })

  test("start takes a value set on the page's first line", () => {
    const carried = { start: { value: 'Earlier' } }
    expect(paginateVariables([unit(0, [{ name: 'start', value: 'Opening' }])], carried, declarations).values.start?.start).toBe('Opening')
  })

  test('first and last take values set mid-page', () => {
    const placed = [
      unit(0),
      unit(1, [
        { name: 'first', value: 'First' },
        { name: 'last', value: 'First' },
      ]),
      unit(1, [{ name: 'last', value: 'Last' }]),
    ]
    const values = paginateVariables(placed, {}, declarations).values
    expect(values.first?.first).toBe('First')
    expect(values.last?.last).toBe('Last')
  })

  test('nothing set and nothing carried gives empty values', () => {
    expect(paginateVariables([unit(0)], {}, declarations).values).toMatchObject({
      start: { start: '', first: '', last: '' },
      first: { start: '', first: '', last: '' },
      last: { start: '', first: '', last: '' },
    })
  })
})
