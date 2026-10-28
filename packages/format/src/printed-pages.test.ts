import { describe, expect, test } from 'bun:test'
import { Page } from './index.ts'
import { BOOK_PARENT_NAMES, bookParentPages } from './printed-pages.ts'

const base = {
  html: '<p>body</p>',
  print: { paper: 'letter' as const, orientation: 'portrait' as const },
  printedPages: {
    parents: [{ name: 'body', margin: { top: 20, bottom: 20, inner: 15, outer: 15 } }],
    rules: { every: 'body' },
  },
}

describe('Page printedPages', () => {
  test.each([
    [{ ...base, print: undefined }, 'add print.paper'],
    [{ ...base, scripts: 'sandboxed' }, 'deterministic cloned content'],
    [{ ...base, print: { ...base.print, margin: { top: 1, right: 1, bottom: 1, left: 1 } } }, 'remove print.margin'],
    [{ ...base, print: { ...base.print, bleed: 1 } }, 'remove bleed and marks'],
    [{ ...base, printedPages: { ...base.printedPages, rules: { every: 'missing' } } }, 'add that parent page'],
    [{ ...base, printedPages: { ...base.printedPages, parents: [...base.printedPages.parents, base.printedPages.parents[0]] } }, 'unique name'],
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

describe('bookParentPages', () => {
  test('builds mirrored book furniture from one margin', () => {
    const margin = { top: 15, bottom: 16, inner: 20, outer: 12 }
    const parents = bookParentPages(margin)

    expect(parents.map(({ name, head, foot }) => ({ name, head, foot }))).toEqual([
      {
        name: BOOK_PARENT_NAMES.recto,
        head: '<div class="segnavia-running-head" data-motif="segnavia:running-head"></div>',
        foot: '<div class="segnavia-folio" data-motif="segnavia:folio"></div>',
      },
      {
        name: BOOK_PARENT_NAMES.verso,
        head: '<div class="segnavia-running-head" data-motif="segnavia:running-head"></div>',
        foot: '<div class="segnavia-folio" data-motif="segnavia:folio"></div>',
      },
      { name: BOOK_PARENT_NAMES.opener, head: undefined, foot: '<div class="segnavia-folio" data-motif="segnavia:folio"></div>' },
      { name: BOOK_PARENT_NAMES.blank, head: undefined, foot: undefined },
    ])
    expect(parents.every((parent) => parent.margin !== margin && parent.margin?.top === margin.top)).toBe(true)
  })
})
