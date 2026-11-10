import { describe, expect, test } from 'bun:test'
import { Page } from './index.ts'
import { BOOK_PARENT_NAMES, bookParentPages, PrintedPages, resolveParentPages } from './printed-pages.ts'

const base = {
  html: '<p>body</p>',
  print: { paper: 'letter' as const, orientation: 'portrait' as const },
  printedPages: {
    parents: [{ name: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 15, inlineEnd: 15 } }],
    parentRules: [{ parent: 'body' }],
  },
}

describe('Page printedPages', () => {
  test('requires every logical parent-page margin and refuses legacy margin names', () => {
    expect(() => PrintedPages.parse({ ...base.printedPages, parents: [{ name: 'body', margin: { inlineStart: 15 } }] })).toThrow('blockStart')
    expect(() =>
      PrintedPages.parse({
        ...base.printedPages,
        parents: [{ name: 'body', margin: { top: 20, bottom: 20, inner: 15, outer: 15 } }],
      }),
    ).toThrow('use blockStart, blockEnd, inlineStart and inlineEnd to clear this refusal')
  })

  test('fragmentation defaults to safe, accepts none and refuses other values', () => {
    expect(PrintedPages.parse(base.printedPages).fragmentation).toBe('safe')
    expect(PrintedPages.parse({ ...base.printedPages, fragmentation: 'none' }).fragmentation).toBe('none')
    expect(PrintedPages.safeParse({ ...base.printedPages, fragmentation: 'always' }).success).toBe(false)
  })

  test('stores authored definitions and round-trips through JSON', () => {
    const printed = PrintedPages.parse({
      ...base.printedPages,
      variables: [{ name: 'topic', kind: 'text', from: 'content' }],
      headTemplates: [{ name: 'topic-head', parts: [{ variable: 'topic' }] }],
    })
    expect(printed.variables.map(({ name }) => name)).toEqual(['topic'])
    expect(printed.headTemplates.map(({ name }) => name)).toEqual(['topic-head'])
    expect(PrintedPages.parse(JSON.parse(JSON.stringify(printed)))).toEqual(printed)
  })

  test('accepts sections without a page body and refuses sections together with a body', () => {
    const sections = [{ id: 'body', title: 'Body', opens: 'recto' as const, numbering: { restart: 2 }, html: '<p>Body</p>' }]
    const sectioned = Page.parse({ ...base, html: undefined, printedPages: { ...base.printedPages, sections } })
    expect(sectioned.body).toBeUndefined()
    expect(sectioned.printedPages?.sections).toEqual(sections)
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, sections } })).toThrow('remove the body or sections to clear this refusal')
  })

  test('refuses continue on the first printed section with its remedy', () => {
    expect(() =>
      PrintedPages.parse({
        ...base.printedPages,
        sections: [{ id: 'continued', opens: 'continue', html: '<p>Continued</p>' }],
      }),
    ).toThrow('use another opens value to clear this refusal')
  })

  test.each([
    [{ ...base, print: undefined }, 'add print.paper'],
    [{ ...base, scripts: 'sandboxed' }, 'deterministic cloned content'],
    [{ ...base, print: { ...base.print, margin: { blockStart: 1, blockEnd: 1, inlineStart: 1, inlineEnd: 1 } } }, 'remove print.margin'],
    [{ ...base, printedPages: { ...base.printedPages, parentRules: [{ parent: 'missing' }] } }, 'add that parent page'],
    [{ ...base, printedPages: { ...base.printedPages, parents: [...base.printedPages.parents, base.printedPages.parents[0]] } }, 'unique name'],
    [
      {
        ...base,
        printedPages: {
          parents: [
            { name: 'one', basedOn: 'two' },
            { name: 'two', basedOn: 'one' },
          ],
          parentRules: [{ parent: 'one' }],
        },
      },
      'remove a basedOn link',
    ],
  ])('names what clears a model refusal', (input, remedy) => {
    expect(() => Page.parse(input)).toThrow(remedy)
  })

  test('refuses invalid rule lists and a host built-in name with their remedies', () => {
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, parentRules: [{ when: { face: 'recto' }, parent: 'body' }] } })).toThrow(
      'add an unconditional last rule',
    )
    expect(() =>
      Page.parse({ ...base, printedPages: { ...base.printedPages, parentRules: [{ parent: 'body' }, { when: { face: 'recto' }, parent: 'body' }] } }),
    ).toThrow('move the unconditional rule to the end')
    expect(() =>
      Page.parse({ ...base, printedPages: { ...base.printedPages, parents: [{ ...base.printedPages.parents[0], name: 'segnavia:recto' }] } }),
    ).toThrow('set basedOn')
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, parentRules: [{ when: {}, parent: 'body' }, { parent: 'body' }] } })).toThrow(
      'state a position, face or blank condition, or remove when',
    )
  })

  test('refuses unknown and renamed parent fields in printed sections', () => {
    expect(() =>
      Page.parse({
        ...base,
        html: undefined,
        printedPages: {
          ...base.printedPages,
          sections: [{ id: 'one', html: '<p>One</p>', parentRules: [{ parent: 'missing' }] }],
        },
      }),
    ).toThrow('unknown parent page')
    const result = Page.safeParse({
      ...base,
      html: undefined,
      printedPages: { ...base.printedPages, sections: [{ id: 'one', html: '<p>One</p>', parents: { recto: 'body' } }] },
    })
    expect(result.error?.issues.find((issue) => issue.message.includes('renamed'))?.path).toEqual(['printedPages', 'sections', 0, 'parents'])
  })

  test('refuses the renamed printed rules field', () => {
    expect(() => Page.parse({ ...base, printedPages: { ...base.printedPages, rules: { every: 'body' } } })).toThrow(
      'printed field rules was renamed; use parentRules instead',
    )
  })
})

describe('bookParentPages', () => {
  test('builds mirrored book furniture from one margin', () => {
    const margin = { blockStart: 15, blockEnd: 16, inlineStart: 20, inlineEnd: 12 }
    const parents = bookParentPages(margin)

    expect(parents.map(({ name, regions }) => ({ name, regions }))).toEqual([
      {
        name: BOOK_PARENT_NAMES.recto,
        regions: {
          head: { edge: 'blockStart', html: '<div class="segnavia-running-head" data-motif="segnavia:head-template" data-motif-name="segnavia:running-head"></div>' },
          foot: { edge: 'blockEnd', html: '<div class="segnavia-folio" data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></div>' },
        },
      },
      {
        name: BOOK_PARENT_NAMES.verso,
        regions: {
          head: { edge: 'blockStart', html: '<div class="segnavia-running-head" data-motif="segnavia:head-template" data-motif-name="segnavia:running-head"></div>' },
          foot: { edge: 'blockEnd', html: '<div class="segnavia-folio" data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></div>' },
        },
      },
      {
        name: BOOK_PARENT_NAMES.opener,
        regions: { foot: { edge: 'blockEnd', html: '<div class="segnavia-folio" data-motif="segnavia:head-template" data-motif-name="segnavia:folio"></div>' } },
      },
      { name: BOOK_PARENT_NAMES.blank, regions: {} },
    ])
    expect(parents.every((parent) => parent.margin !== margin && parent.margin?.blockStart === margin.blockStart)).toBe(true)
  })

  test('merges inherited regions by name', () => {
    const resolved = resolveParentPages([
      { name: 'base', regions: { head: { edge: 'blockStart', html: 'base head' }, side: { edge: 'inlineEnd', html: 'base side' } } },
      { name: 'child', basedOn: 'base', regions: { head: { edge: 'blockEnd', html: 'child head' } } },
    ])
    expect(resolved[1]?.regions).toEqual({
      head: { edge: 'blockEnd', html: 'child head' },
      side: { edge: 'inlineEnd', html: 'base side' },
    })
  })
})
