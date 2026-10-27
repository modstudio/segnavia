import { describe, expect, test } from 'bun:test'
import { Page } from './index.ts'

const base = {
  html: '<p>body</p>',
  print: { paper: 'letter' as const, orientation: 'portrait' as const },
  printedPages: {
    parents: [{ name: 'body', margin: { top: 20, bottom: 20, inner: 15, outer: 15 } }],
    rules: { every: 'body' },
  },
}

describe('Page printedPages', () => {
  test('appears in JSON input and resolves defaults', () => {
    expect(Page.parse(base).printedPages?.parents[0]?.name).toBe('body')
  })

  test.each([
    [{ ...base, print: undefined }, 'add print.paper'],
    [{ ...base, scripts: 'sandboxed' }, 'deterministic cloned content'],
    [{ ...base, print: { ...base.print, margin: { top: 1, right: 1, bottom: 1, left: 1 } } }, 'remove print.margin'],
    [{ ...base, print: { ...base.print, bleed: 1 } }, 'remove bleed and marks'],
    [{ ...base, printedPages: { ...base.printedPages, rules: { every: 'missing' } } }, 'add that parent page'],
    [
      {
        ...base,
        printedPages: {
          parents: [
            { name: 'one', basedOn: 'two' },
            { name: 'two', basedOn: 'one' },
          ],
          rules: { every: 'one' },
        },
      },
      'remove a basedOn link',
    ],
  ])('names what clears a model refusal', (input, remedy) => {
    expect(() => Page.parse(input)).toThrow(remedy)
  })

  test('refuses a missing every and an unknown role with their allowed fixes', () => {
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, rules: {} } })).toThrow('name the default parent page')
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, rules: { every: 'body', middle: 'body' } } })).toThrow(
      'use only every, first, recto, verso or last',
    )
  })
})
