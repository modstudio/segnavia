import { expect, test } from 'bun:test'
import { fillFurniture, fillRegion, markFurnitureOverflow, markRegionOverflow, preflightPageFacts, resolveRegionHeads } from './composer-dress.ts'

test('fills named head templates and removes an empty placement', () => {
  const html = '<div data-motif="segnavia:head-template" data-motif-name="head"></div><i data-motif="segnavia:head-template" data-motif-name="empty"></i>'
  expect(fillRegion(html, { heads: { head: '<bdi dir="rtl">פרשה</bdi>', empty: '' } }, 'rtl', 'he')).toBe('<div><bdi dir="rtl">פרשה</bdi></div>')
})

test('fills balanced and self-closing head-template placements', () => {
  expect(
    fillRegion('<div data-motif="segnavia:head-template" data-motif-name="head"><div class="inner">old</div></div>', {
      heads: { head: '<bdi>New</bdi>' },
    }),
  ).toBe('<div><bdi>New</bdi></div>')
  expect(fillRegion('<span class="folio" data-motif="segnavia:head-template" data-motif-name="head"/>', { heads: { head: '<bdi>7</bdi>' } })).toBe(
    '<span class="folio"><bdi>7</bdi></span>',
  )
})

test('fills only the outer placement when head-template placements are nested', () => {
  const html = '<div data-motif="segnavia:head-template" data-motif-name="outer"><div data-motif="segnavia:head-template" data-motif-name="inner"></div></div>'
  expect(fillRegion(html, { heads: { outer: '<bdi>Outer</bdi>', inner: '<bdi>Inner</bdi>' } })).toBe('<div><bdi>Outer</bdi></div>')
})

test('removes inherited and unbounded head-template placements', () => {
  expect(fillRegion('<div data-motif="segnavia:head-template" data-motif-name="constructor"></div>', { heads: {} })).toBe('')
  expect(fillRegion('<div data-motif="segnavia:head-template" data-motif-name="head">Text', { heads: { head: '<bdi>Head</bdi>' } })).toBe('Text')
})

test('fills printed-page furniture from a text variable and record slot', () => {
  const heads = resolveRegionHeads(
    [{ name: 'record-head', parts: [{ variable: 'parasha' }, { record: 'name' }], separator: ' — ', dropEmpty: true, collapseEqual: true }],
    { parasha: 'בראשית' },
    { name: 'כהן' },
    'rtl',
    'he',
  )
  const html = fillRegion('<div data-motif="segnavia:head-template" data-motif-name="record-head"></div>', { heads }, 'rtl', 'he')
  expect(html).toContain('<bdi dir="rtl">בראשית</bdi><span dir="rtl"> — </span><bdi dir="rtl">כהן</bdi>')
})

test('fills a head template and an author record slot in one pass', () => {
  const slot = {
    path: 'record.name',
    removed: false,
    direction: '',
    textContent: '',
    getAttribute(name: string) {
      return name === 'data-slot-value' ? this.path : null
    },
    hasAttribute(name: string) {
      return name === 'dir' && this.direction !== ''
    },
    removeAttribute(name: string) {
      if (name === 'data-slot-value') this.path = ''
    },
    setAttribute(name: string, value: string) {
      if (name === 'dir') this.direction = value
    },
    remove() {
      this.removed = true
    },
  }
  const root = {
    innerHTML: '',
    querySelectorAll: () => [slot],
  } as unknown as Element

  fillFurniture(
    root,
    '<span data-motif="segnavia:head-template" data-motif-name="head"></span><span data-slot-value="record.name"></span>',
    { head: '<bdi dir="rtl">פרק ראשון</bdi>' },
    { name: 'כהן' },
    'rtl',
    'he',
  )

  expect(root.innerHTML).toContain('<bdi dir="rtl">פרק ראשון</bdi>')
  expect(slot).toMatchObject({ direction: 'auto', path: '', removed: false, textContent: 'כהן' })
})

test('removes an undefined record binding', () => {
  const slot = {
    removed: false,
    getAttribute: () => 'record.name',
    remove() {
      this.removed = true
    },
  }
  const root = { innerHTML: '', querySelectorAll: () => [slot] } as unknown as Element
  fillFurniture(root, '<span data-slot-value="record.name"></span>', {}, { name: undefined }, undefined, undefined)
  expect(slot.removed).toBeTrue()
})

test('collects furniture and template-region overset as separate preflight entries', () => {
  const entries: import('@segnavia/format').PreflightEntry[] = []
  const page = { getAttribute: (name: string) => (name === 'data-segnavia-folio' ? 'iv' : null) } as unknown as Element
  const head = {
    scrollHeight: 31,
    clientHeight: 20,
    getAttribute: (name: string) => (name === 'data-segnavia-parent' ? 'body' : name === 'data-segnavia-region' ? 'head' : null),
  } as unknown as HTMLElement
  markFurnitureOverflow(head, page, entries)
  expect(entries[0]).toMatchObject({ check: 'furniture-overset', subject: 'body:head', location: { folio: 'iv' } })
  expect(entries[0]?.message).toEndWith('to clear it.')

  const region = {
    getAttribute: (name: string) => (name === 'data-region' ? 'sidebar' : null),
  } as unknown as HTMLElement
  const root = { querySelectorAll: () => [region], getAttribute: (name: string) => (name === 'data-template' ? 'lesson' : null) } as unknown as Element
  markRegionOverflow(root, 'iv', () => ({ block: 11, inline: 0 }), entries)
  expect(entries[1]).toMatchObject({ check: 'region-overset', subject: 'lesson:sidebar', location: { folio: 'iv' } })
  expect(entries[1]?.message).toEndWith('to clear it.')
})

test('reports the first and last block on each page without walking composed pages', () => {
  const pages = [
    { flow: 'split', windows: [{ flow: 'split', start: 0, end: 20 }] },
    { flow: 'split', windows: [{ flow: 'split', start: 20, end: 40 }] },
    { flow: 'break', windows: [{ flow: 'break', start: 0, end: 10 }] },
    { flow: 'break', windows: [{ flow: 'break', start: 10, end: 20 }] },
    { flow: 'blank', windows: [] },
    { flow: 'chapter', windows: [{ flow: 'chapter', start: 0, end: 10 }] },
    { flow: 'appendix', windows: [{ flow: 'appendix', start: 0, end: 10 }] },
    { flow: 'fixed', windows: [{ flow: 'fixed', start: 0, end: 10 }] },
  ]
  const line = (top: number, bottom: number) => ({ top, bottom })
  const flows = [
    {
      id: 'split',
      kind: 'chapter',
      blocks: [
        { id: 'first', lines: [line(0, 10)] },
        { id: 'split', lines: [line(10, 20), line(20, 30)] },
        { id: 'last', lines: [line(30, 40)] },
      ],
    },
    {
      id: 'break',
      kind: 'chapter',
      blocks: [
        { id: 'before-break', lines: [line(0, 10)] },
        { id: 'after-break', lines: [line(10, 20)] },
      ],
    },
    { id: 'chapter', kind: 'chapter', blocks: [{ id: 'chapter-only', lines: [line(0, 10)] }] },
    { id: 'appendix', kind: 'chapter', blocks: [{ id: 'appendix-only', lines: [line(0, 10)] }] },
    { id: 'fixed', kind: 'fixed', pages: 1 },
  ]

  expect(preflightPageFacts(pages as never, ['1', '2', '3', '4', null, '5', '6', '7'], flows as never)).toEqual([
    { folio: '1', first: 'first', last: 'split' },
    { folio: '2', first: 'split', last: 'last' },
    { folio: '3', first: 'before-break', last: 'before-break' },
    { folio: '4', first: 'after-break', last: 'after-break' },
    { folio: '' },
    { folio: '5', first: 'chapter-only', last: 'chapter-only' },
    { folio: '6', first: 'appendix-only', last: 'appendix-only' },
    { folio: '7' },
  ])
})
