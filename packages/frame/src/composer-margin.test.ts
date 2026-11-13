import { expect, test } from 'bun:test'
import { boundPreflightReport, PREFLIGHT_PRESETS, type PreflightEntry, preflightRefusal } from '@segnavia/format'
import type { NumberedLine, PageLineNumbers } from '@segnavia/layout'
import { appendMarginOverset, createLineNumber, crossedLimit, drawLineNumbers, drawPageLineNumbers, lineNumberEdge, physicalColumn } from './composer-margin.ts'

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
