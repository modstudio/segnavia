import { expect, test } from 'bun:test'
import { fillFurniture, fillRegion, markFurnitureOverflow, markRegionOverflow, resolveRegionHeads } from './composer-dress.ts'

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

test('keeps furniture and template-region overflow as separate page facts', () => {
  const attributes = new Map<string, string>()
  const page = { setAttribute: (name: string, value: string) => attributes.set(name, value) } as unknown as Element
  const head = {
    scrollHeight: 31,
    clientHeight: 20,
    hasAttribute: (name: string) => name === 'data-segnavia-head',
    getAttribute: (name: string) => (name === 'data-segnavia-parent' ? 'body' : null),
  } as unknown as HTMLElement
  markFurnitureOverflow(head, page)
  expect(attributes.get('data-segnavia-furniture-overflow')).toBe('body:head:11')
  expect(attributes.has('data-segnavia-region-overflow')).toBeFalse()

  attributes.clear()
  const region = {
    getAttribute: (name: string) => (name === 'data-region' ? 'sidebar' : null),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLElement
  const root = { querySelectorAll: () => [region] } as unknown as Element
  markRegionOverflow(root, 'iv', () => ({ block: 11, inline: 0 }))
  expect(attributes.get('data-segnavia-region-overflow')).toBe('iv:sidebar:11')
  expect(attributes.has('data-segnavia-furniture-overflow')).toBeFalse()
})
