import { describe, expect, test } from 'bun:test'
import { block, flow, input } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'
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

  test('a Hebrew parasha uses first while start carries into a continuation', () => {
    const definitions = [
      { name: 'parasha-first', kind: 'text' as const, from: 'content' as const, pick: 'first' as const },
      { name: 'parasha-start', kind: 'text' as const, from: 'content' as const, pick: 'start' as const },
    ]
    const opening = paginateVariables(
      [
        unit(0, [
          { name: 'parasha-first', value: 'בראשית' },
          { name: 'parasha-start', value: 'בראשית' },
        ]),
      ],
      {},
      definitions,
    )
    const continuation = paginateVariables([unit(1)], opening.carried, definitions)
    expect(opening.values['parasha-first']?.first).toBe('בראשית')
    expect(continuation.values['parasha-start']?.start).toBe('בראשית')
  })

  test('nothing set and nothing carried gives empty values', () => {
    expect(paginateVariables([unit(0)], {}, declarations).values).toMatchObject({
      start: { start: '', first: '', last: '' },
      first: { start: '', first: '', last: '' },
      last: { start: '', first: '', last: '' },
    })
  })

  test('section-title values carry only within their flow', () => {
    const result = paginateBook(
      input({
        variables: [{ name: 'title', kind: 'text', from: 'section-title', pick: 'first' }],
        flows: [
          flow('one', 'chapter', [block('text', 'p', 1, 1, 6, 0, { variables: [{ name: 'title', value: 'One', line: 0, scope: 'flow' }] })]),
          flow('two', 'chapter', [block('text', 'p', 2, 1, 1, 0)]),
        ],
      }),
    )
    expect(result.pages.filter((page) => page.flow === 'one').map((page) => page.variables.title)).toEqual(['One', 'One'])
    expect(result.pages.find((page) => page.flow === 'two')?.variables.title).toBeUndefined()
  })
})
