import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry, preflightRefusal } from '@segnavia/format'
import type { NumberedLine, PageLineNumbers } from '@segnavia/layout'
import {
  appendMarginOverset,
  claimSideNotes,
  createLineNumber,
  crossedLimit,
  drawLineNumbers,
  drawPageLineNumbers,
  drawPageSideNotes,
  lineNumberEdge,
  lineNumberInnerEdge,
  physicalColumn,
  prepareSideNote,
  stackPageSideNotes,
} from './composer-margin.ts'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect

const line = (value: number, side: 'left' | 'right', column = 0, columns = 1): NumberedLine => ({
  value,
  label: String(value),
  top: 5,
  height: 10,
  column,
  columns,
  side,
})

class FakeElement {
  attributes = new Map<string, string>()
  children: FakeElement[] = []
  style: Record<string, string> = {}
  textContent = ''
  constructor(
    readonly tagName: string,
    private box = rect(0, 0, 6, 10),
  ) {}
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null
  }
  append(child: FakeElement) {
    this.children.push(child)
  }
  querySelector(selector: string) {
    return selector === '[data-segnavia-text]' ? (this.children.find((child) => child.attributes.has('data-segnavia-text')) ?? null) : null
  }
  querySelectorAll() {
    return []
  }
  getBoundingClientRect() {
    if (this.tagName !== 'bdi') return this.box
    const left = this.style.left === undefined ? this.box.left : Number.parseFloat(this.style.left)
    const top = Number.parseFloat(this.style.top ?? '0')
    return rect(left, top, this.box.width, Number.parseFloat(this.style.lineHeight ?? '10'))
  }
}

function fakePage(marker: number, folio = String(marker)) {
  const page = new FakeElement('page', rect(-20, 0, 140, 100))
  page.setAttribute('data-page', String(marker))
  page.setAttribute('data-segnavia-folio', folio)
  const text = new FakeElement('text', rect(0, 0, 100, 100))
  text.setAttribute('data-segnavia-text', '')
  page.append(text)
  const doc = {
    createElement: (tag: string) => new FakeElement(tag),
    querySelectorAll: () => [page],
  } as unknown as Document
  return { doc, page: page as unknown as HTMLElement, text }
}

const config = (area: 'text' | 'margin' = 'text', direction: 'ltr' | 'rtl' = 'ltr') => ({
  area,
  direction,
  geometries: [{ columnGap: 10, parents: [] }],
  pageMarker: 'data-page',
})

test('draws a separately composed page from its own plan page', () => {
  const { doc, text } = fakePage(2)
  const numbered: PageLineNumbers[] = [
    { page: 0, lines: [line(1, 'left')] },
    { page: 1, lines: [line(8, 'left')] },
  ]
  drawLineNumbers(numbered, config(), [], doc)
  expect(text.children[0]?.children[0]?.getAttribute('data-segnavia-line-number')).toBe('8')
})

test('anchors text numbers on their physical column edge', () => {
  const doc = { createElement: (tag: string) => new FakeElement(tag) } as unknown as Document
  const text = rect(0, 0, 100, 100)
  const page = rect(-20, 0, 140, 100)
  const cases = [
    { held: line(1, 'left'), direction: 'ltr' as const, anchor: 0, edge: 'outer' },
    { held: line(1, 'right'), direction: 'ltr' as const, anchor: 100, edge: 'outer' },
    { held: line(1, 'right', 0, 2), direction: 'ltr' as const, anchor: 45, edge: 'interior' },
    { held: line(1, 'left', 0, 2), direction: 'rtl' as const, anchor: 55, edge: 'interior' },
  ]
  for (const item of cases) {
    const number = createLineNumber(item.held, config('text', item.direction), text, page, 10, doc)
    expect(number.style.left).toBe(`${item.anchor}px`)
    expect(number.getAttribute('data-segnavia-edge')).toBe(item.edge)
  }
})

test('tests interior edges against the physical column in both directions', () => {
  expect(physicalColumn(line(1, 'left', 0, 2), 'ltr')).toBe(0)
  expect(physicalColumn(line(1, 'left', 0, 2), 'rtl')).toBe(1)
  expect(lineNumberEdge(line(1, 'left', 0, 2), 'ltr')).toBe('outer')
  expect(lineNumberEdge(line(1, 'left', 0, 2), 'rtl')).toBe('interior')
  expect(crossedLimit(rect(40, 5, 11, 10), rect(0, 0, 100, 100), [] as unknown as NodeListOf<Element>, line(1, 'left', 0, 2), 'text', 'ltr', 10)).toBe('')
  expect(crossedLimit(rect(49, 5, 11, 10), rect(0, 0, 100, 100), [] as unknown as NodeListOf<Element>, line(1, 'left', 0, 2), 'text', 'rtl', 10)).toBe(
    'the column gap',
  )
})

test('reports and deduplicates page, furniture and column-gap overset under strict preflight', () => {
  const entries: PreflightEntry[] = []
  const page = rect(0, 0, 100, 100)
  const furniture = [{ getBoundingClientRect: () => rect(20, 0, 20, 20), getAttribute: () => 'head' }] as unknown as NodeListOf<Element>
  const sources = [line(1, 'left'), line(2, 'left'), line(3, 'right', 0, 2)] as const
  const crossings = [
    crossedLimit(rect(-1, 5, 6, 10), page, [] as unknown as NodeListOf<Element>, sources[0], 'text', 'ltr', 10),
    crossedLimit(rect(25, 5, 6, 10), page, furniture, sources[1], 'text', 'ltr', 10),
    crossedLimit(rect(45, 5, 11, 10), page, [] as unknown as NodeListOf<Element>, sources[2], 'text', 'ltr', 10),
  ]
  for (let index = 0; index < crossings.length; index += 1) {
    const source = sources[index]
    const crossed = crossings[index]
    if (source && crossed) appendMarginOverset(entries, source, crossed, '12')
  }
  appendMarginOverset(entries, sources[0], crossings[0] ?? '', '12')
  expect(crossings).toEqual(['the page edge', 'region head', 'the column gap'])
  expect(entries).toHaveLength(3)
  expect(entries.map((entry) => entry.location?.folio)).toEqual(['12', '12', '12'])
  const report = boundPreflightReport({ entries, facts: { pageCount: 1, pages: [], fits: [] } }, PREFLIGHT_PRESETS.strict)
  expect(report.issues.every((issue) => issue.check === 'margin-overset' && issue.severity === 'error')).toBe(true)
  expect(preflightRefusal(report)).toContain('Line number 1 crosses the page edge')
})

test('reports colliding margin-area numbers', () => {
  const { doc, page } = fakePage(1, '7')
  const entries: PreflightEntry[] = []
  drawPageLineNumbers({ page: 0, lines: [line(4, 'left', 0, 2), line(5, 'left', 1, 2)] }, page, config('margin'), entries, doc)
  expect(entries).toContainEqual(
    expect.objectContaining({ check: 'margin-overset', subject: 'line:5', message: expect.stringContaining('line number 4'), location: { folio: '7' } }),
  )
})

test('claims one heading instance document-wide and keeps its id', () => {
  const attributes = new Map([
    ['data-side-note', ''],
    ['data-segnavia-id', 'note'],
  ])
  let selectedRemoved = false
  const selected = {
    id: '',
    tagName: 'H2',
    style: {} as Record<string, string>,
    textContent: 'הערה',
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    remove: () => {
      selectedRemoved = true
    },
  } as unknown as HTMLElement
  const duplicate = {
    ...selected,
    id: 'side-heading',
    remove: () => {},
  } as HTMLElement
  const doc = { querySelectorAll: () => [selected, duplicate] } as unknown as Document
  const claimed = claimSideNotes([{ page: 0, notes: [{ id: 'note', top: 10, side: 'left', column: 0, columns: 1 }] }], doc)
  expect(claimed.get('note')).toBe(duplicate)
  expect(claimed.get('note')?.id).toBe('side-heading')
  expect(selectedRemoved).toBe(true)
})

test('reserves through the drawn inner edge of margin-area line numbers on each physical side', () => {
  const attributes = new Map([
    ['data-side-note', ''],
    ['data-segnavia-id', 'elsewhere'],
  ])
  const note = {
    id: '',
    style: {} as Record<string, string>,
    textContent: 'הערה',
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    remove: () => {},
  } as unknown as HTMLElement
  const leftNumber = { getBoundingClientRect: () => rect(4, 0, 8, 10) }
  const rightNumber = { getBoundingClientRect: () => rect(88, 0, 8, 10) }
  const exact = '[data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-line-number]'
  const page = {
    querySelectorAll: (selector: string) => {
      if (selector === `${exact}[data-segnavia-side="left"]`) return [leftNumber]
      if (selector === `${exact}[data-segnavia-side="right"]`) return [rightNumber]
      return []
    },
  } as unknown as HTMLElement
  const text = rect(20, 0, 60, 100)
  const paper = rect(0, 0, 100, 100)
  const entries: PreflightEntry[] = []
  const left = prepareSideNote({ id: 'elsewhere', top: 10, side: 'left', column: 0, columns: 1 }, note, page, text, paper, 4, entries, '7')
  expect(left.element.style.left).toBe('-4px')
  expect(left.element.style.width).toBe('0px')
  expect(left.element.getAttribute('dir')).toBe('rtl')
  const right = prepareSideNote({ id: 'elsewhere', top: 10, side: 'right', column: 0, columns: 1 }, note, page, text, paper, 4, entries, '7')
  expect(right.element.style.left).toBe('64px')
  expect(right.element.style.width).toBe('0px')
  expect(lineNumberInnerEdge(page, 'left')).toBe(12)
  expect(lineNumberInnerEdge(page, 'right')).toBe(88)
  expect(entries).toEqual([
    {
      check: 'margin-overset',
      subject: 'side-note:elsewhere',
      message: expect.stringContaining('margin is too narrow'),
      location: { folio: '7' },
    },
  ])

  const pageWithoutNumbers = { querySelectorAll: () => [] } as unknown as HTMLElement
  const unreservedLeft = prepareSideNote({ id: 'elsewhere', top: 10, side: 'left', column: 0, columns: 1 }, note, pageWithoutNumbers, text, paper, 4, [], '7')
  expect(unreservedLeft.element.style.left).toBe('-16px')
  expect(unreservedLeft.element.style.width).toBe('12px')
  const unreservedRight = prepareSideNote({ id: 'elsewhere', top: 10, side: 'right', column: 0, columns: 1 }, note, pageWithoutNumbers, text, paper, 4, [], '7')
  expect(unreservedRight.element.style.left).toBe('64px')
  expect(unreservedRight.element.style.width).toBe('12px')
})

test('keeps side notes clear of inset margin numbers when the configured gap is zero', () => {
  const attributes = new Map([
    ['data-side-note', ''],
    ['data-segnavia-id', 'inset'],
  ])
  const note = {
    style: {} as Record<string, string>,
    textContent: 'note',
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as HTMLElement
  const exact = '[data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-line-number]'
  const numbers = {
    left: rect(5, 0, 6, 10),
    right: rect(89, 0, 6, 10),
  }
  const page = {
    querySelectorAll: (selector: string) => {
      const side = selector === `${exact}[data-segnavia-side="left"]` ? 'left' : 'right'
      return [{ getBoundingClientRect: () => numbers[side] }]
    },
  } as unknown as HTMLElement
  const text = rect(20, 0, 60, 100)
  const paper = rect(0, 0, 100, 100)
  const left = prepareSideNote({ id: 'inset', top: 10, side: 'left', column: 0, columns: 1 }, note, page, text, paper, 0, [], '7').element
  expect(Number.parseFloat(left.style.left) + text.left).toBe(numbers.left.right)
  expect(Number.parseFloat(left.style.width)).toBe(text.left - numbers.left.right)
  const right = prepareSideNote({ id: 'inset', top: 10, side: 'right', column: 0, columns: 1 }, note, page, text, paper, 0, [], '7').element
  expect(Number.parseFloat(right.style.left) + text.left).toBe(text.right)
  expect(Number.parseFloat(right.style.left) + text.left + Number.parseFloat(right.style.width)).toBe(numbers.right.left)
})

test('reports a placed side note that has no composed copy', () => {
  const { doc, page } = fakePage(1, '7')
  const entries: PreflightEntry[] = []
  drawPageSideNotes({ page: 0, notes: [{ id: 'missing', top: 10, side: 'left', column: 0, columns: 1 }] }, page, config(), entries, doc, new Map())
  expect(entries).toEqual([
    {
      check: 'margin-overset',
      subject: 'side-note:missing',
      message: expect.stringContaining('source flow'),
      location: { folio: '7' },
    },
  ])
})

test('reports and deduplicates side notes crossing edges, furniture and margin numbers, including stacking overflow', () => {
  const drawn = (id: string, top: number, height: number) => {
    const style: Record<string, string> = {}
    const element = {
      style,
      getBoundingClientRect() {
        return rect(10, Number.parseFloat(style.top ?? String(top)), 10, height)
      },
    } as unknown as HTMLElement
    return { id, top, side: 'left' as const, element }
  }
  const items = [drawn('furniture', 30, 10), drawn('number', 60, 10), drawn('stack-a', 80, 15), drawn('stack-b', 82, 15)]
  const furniture = [{ getBoundingClientRect: () => rect(0, 30, 30, 20), getAttribute: () => 'head' }] as unknown as NodeListOf<Element>
  const numbers = [
    { getBoundingClientRect: () => rect(5, 60, 20, 10), getAttribute: (name: string) => (name === 'data-segnavia-line-number' ? '10' : null) },
  ] as unknown as NodeListOf<Element>
  const entries: PreflightEntry[] = []
  stackPageSideNotes(items, 'left', 4, rect(0, 0, 100, 100), furniture, numbers, entries, '12')
  stackPageSideNotes(items, 'left', 4, rect(0, 0, 100, 100), furniture, numbers, entries, '12')
  expect(entries.map((entry) => [entry.subject, entry.location?.folio])).toEqual([
    ['side-note:furniture', '12'],
    ['side-note:number', '12'],
    ['side-note:stack-b', '12'],
  ])
  expect(entries.map((entry) => entry.message)).toEqual([
    expect.stringContaining('region head'),
    expect.stringContaining('line number 10'),
    expect.stringContaining('page edge'),
  ])
  const report = boundPreflightReport({ entries, facts: { pageCount: 1, pages: [], fits: [] } }, PREFLIGHT_PRESETS.strict)
  expect(preflightRefusal(report)).toContain('Side note furniture crosses region head')
})
