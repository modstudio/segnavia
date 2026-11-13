import { type Measurements, type Plan, type PreflightEntry, type ResolvedLineNumbers, resolveDirection, type SideNotes } from '@segnavia/format'
import { type NumberedLine, numberLines, type PageLineNumbers, type PageSideNotes, placeSideNotes, stackDownward } from '@segnavia/layout'

interface DrawConfig {
  area: 'text' | 'margin'
  direction: 'ltr' | 'rtl'
  geometries: ReadonlyArray<{ name?: string; columnGap: number }>
  pageMarker: string
  lineNumbers?: ResolvedLineNumbers
  sideNotes?: SideNotes
}

export function marginLineNumberSelector(side?: 'left' | 'right'): string {
  const selector = '[data-segnavia-line-numbers][data-segnavia-area="margin"] [data-segnavia-line-number]'
  return side ? `${selector}[data-segnavia-side="${side}"]` : selector
}

export function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

export function physicalColumn(line: Pick<NumberedLine, 'column' | 'columns'>, direction: DrawConfig['direction']): number {
  return direction === 'ltr' ? line.column : line.columns - line.column - 1
}

export function lineNumberEdge(line: Pick<NumberedLine, 'column' | 'columns' | 'side'>, direction: DrawConfig['direction']): 'outer' | 'interior' {
  const column = physicalColumn(line, direction)
  return line.side === 'left' ? (column === 0 ? 'outer' : 'interior') : column === line.columns - 1 ? 'outer' : 'interior'
}

export function drawLineNumbers(numbered: ReturnType<typeof numberLines>, config: DrawConfig, entries: PreflightEntry[], doc: Document): void {
  const pages = doc.querySelectorAll(`[${config.pageMarker}]`)
  for (const page of pages) {
    const index = Number(page.getAttribute(config.pageMarker)) - 1
    drawPageLineNumbers(numbered[index], page as HTMLElement, config, entries, doc)
  }
}

export function createLineNumber(line: NumberedLine, config: DrawConfig, textRect: DOMRect, pageRect: DOMRect, gap: number, doc: Document): HTMLElement {
  const number = doc.createElement('bdi')
  number.setAttribute('data-segnavia-line-number', String(line.value))
  number.setAttribute('data-segnavia-side', line.side)
  number.textContent = line.label
  number.style.top = `${line.top}px`
  number.style.lineHeight = `${line.height}px`
  const width = (textRect.width - (line.columns - 1) * gap) / line.columns
  const column = physicalColumn(line, config.direction)
  if (config.area === 'margin' && line.side === 'left') number.style.left = `${pageRect.left - textRect.left}px`
  else if (config.area === 'margin') number.style.right = `${textRect.right - pageRect.right}px`
  else {
    number.setAttribute('data-segnavia-edge', lineNumberEdge(line, config.direction))
    number.style.left = `${line.side === 'left' ? column * (width + gap) : column * (width + gap) + width}px`
  }
  return number
}

export function crossedLimit(
  rect: DOMRect,
  pageRect: DOMRect,
  furniture: NodeListOf<Element>,
  source: NumberedLine,
  area: DrawConfig['area'],
  direction: DrawConfig['direction'],
  gap: number,
): string {
  const outer = crossedPageOrFurniture(rect, pageRect, furniture)
  if (outer) return outer
  const interior = lineNumberEdge(source, direction) === 'interior'
  return area === 'text' && source.columns > 1 && interior && rect.width > gap ? 'the column gap' : ''
}

export function crossedPageOrFurniture(rect: DOMRect, pageRect: DOMRect, furniture: NodeListOf<Element>): string {
  if (rect.left < pageRect.left || rect.right > pageRect.right || rect.top < pageRect.top || rect.bottom > pageRect.bottom) return 'the page edge'
  for (const held of furniture) {
    if (intersects(rect, held.getBoundingClientRect())) return `region ${held.getAttribute('data-segnavia-region') || 'furniture'}`
  }
  return ''
}

export function appendMarginOversetEntry(entries: PreflightEntry[], subject: string, message: string, folio: string): void {
  if (entries.some((entry) => entry.check === 'margin-overset' && entry.subject === subject && entry.location?.folio === folio)) return
  entries.push({ check: 'margin-overset', subject, message, location: { folio } })
}

export function appendMarginOverset(entries: PreflightEntry[], source: NumberedLine, crossed: string, folio: string): void {
  const subject = `line:${source.value}`
  appendMarginOversetEntry(
    entries,
    subject,
    `Line number ${source.value} crosses ${crossed}; change lineNumbers.area or lineNumbers.side, or widen the margin or column gap to clear it.`,
    folio,
  )
}

export function appendSideNoteOverset(entries: PreflightEntry[], id: string, crossed: string, folio: string): void {
  const subject = `side-note:${id}`
  appendMarginOversetEntry(
    entries,
    subject,
    `Side note ${id} crosses ${crossed}; move the note, shorten it, change sideNotes.side, or widen the margin to clear it.`,
    folio,
  )
}

export function appendMissingSideNote(entries: PreflightEntry[], id: string, folio: string): void {
  const subject = `side-note:${id}`
  appendMarginOversetEntry(
    entries,
    subject,
    `Side note ${id} has no composed copy; keep the side note in its source flow so a page or galley copy is available to clear it.`,
    folio,
  )
}

export function widestLineNumber(page: HTMLElement, side: 'left' | 'right'): number {
  let width = 0
  for (const number of page.querySelectorAll(marginLineNumberSelector(side))) {
    width = Math.max(width, number.getBoundingClientRect().width)
  }
  return width
}

interface DrawnSideNote {
  id: string
  top: number
  side: 'left' | 'right'
  element: HTMLElement
}

export function prepareSideNote(
  placement: PageSideNotes['notes'][number],
  note: HTMLElement,
  page: HTMLElement,
  textRect: DOMRect,
  pageRect: DOMRect,
  gap: number,
): DrawnSideNote {
  if (!note.hasAttribute('dir')) note.setAttribute('dir', resolveDirection(undefined, note.getAttribute('lang') ?? undefined, note.textContent ?? ''))
  note.setAttribute('data-segnavia-side', placement.side)
  note.style.top = `${placement.top}px`
  const numberWidth = widestLineNumber(page, placement.side)
  const reserve = numberWidth > 0 ? numberWidth + gap : 0
  if (placement.side === 'left') {
    note.style.left = `${pageRect.left - textRect.left + gap + reserve}px`
    note.style.width = `${Math.max(0, textRect.left - pageRect.left - gap - reserve)}px`
  } else {
    note.style.left = `${textRect.width + gap}px`
    note.style.width = `${Math.max(0, pageRect.right - textRect.right - gap - reserve)}px`
  }
  return { id: placement.id, top: placement.top, side: placement.side, element: note }
}

export function sideNoteCrossing(rect: DOMRect, pageRect: DOMRect, furniture: NodeListOf<Element>, numbers: NodeListOf<Element>): string {
  const outer = crossedPageOrFurniture(rect, pageRect, furniture)
  if (outer) return outer
  for (const number of numbers) {
    if (intersects(rect, number.getBoundingClientRect())) return `line number ${number.getAttribute('data-segnavia-line-number') || ''}`
  }
  return ''
}

export function stackPageSideNotes(
  drawn: DrawnSideNote[],
  side: 'left' | 'right',
  gap: number,
  pageRect: DOMRect,
  furniture: NodeListOf<Element>,
  numbers: NodeListOf<Element>,
  entries: PreflightEntry[],
  folio: string,
): void {
  const items = drawn.filter((item) => item.side === side).sort((a, b) => a.top - b.top)
  const tops = stackDownward(
    items.map((item) => ({ top: item.top, height: item.element.getBoundingClientRect().height })),
    gap,
  )
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!item) continue
    item.element.style.top = `${tops[index] ?? item.top}px`
    const crossed = sideNoteCrossing(item.element.getBoundingClientRect(), pageRect, furniture, numbers)
    if (crossed) appendSideNoteOverset(entries, item.id, crossed, folio)
  }
}

export function drawPageSideNotes(
  held: PageSideNotes | undefined,
  page: HTMLElement | undefined,
  config: DrawConfig,
  entries: PreflightEntry[],
  doc: Document,
  claimed: ReadonlyMap<string, HTMLElement>,
): void {
  if (!held || !page || held.notes.length === 0) return
  const text = page.querySelector('[data-segnavia-text]') as HTMLElement | null
  if (!text) return
  const container = doc.createElement('div')
  container.setAttribute('data-segnavia-side-notes', '')
  const textRect = text.getBoundingClientRect()
  const pageRect = page.getBoundingClientRect()
  const geometryName = page.getAttribute('data-segnavia-page-geometry')
  const geometry = config.geometries.find((candidate) => (candidate.name ?? null) === geometryName) ?? config.geometries[0]
  const gap = geometry?.columnGap ?? 0
  const drawn: DrawnSideNote[] = []
  const folio = page.getAttribute('data-segnavia-folio') || ''
  for (const placement of held.notes) {
    const note = claimed.get(placement.id)
    if (!note) {
      appendMissingSideNote(entries, placement.id, folio)
      continue
    }
    const item = prepareSideNote(placement, note, page, textRect, pageRect, gap)
    container.append(item.element)
    drawn.push(item)
  }
  text.append(container)
  const furniture = page.querySelectorAll('[data-segnavia-region]')
  const numbers = page.querySelectorAll(marginLineNumberSelector())
  for (const side of ['left', 'right'] as const) stackPageSideNotes(drawn, side, gap, pageRect, furniture, numbers, entries, folio)
}

export function claimSideNotes(placed: readonly PageSideNotes[], doc: Document): ReadonlyMap<string, HTMLElement> {
  const claimed = new Map<string, HTMLElement>()
  const wanted = new Set(placed.flatMap((page) => page.notes.map((note) => note.id)))
  const copies = Array.from(doc.querySelectorAll('[data-side-note][data-segnavia-id]')) as HTMLElement[]
  for (const id of wanted) {
    const matches = copies.filter((copy) => copy.getAttribute('data-segnavia-id') === id)
    const note = matches.find((copy) => copy.id) ?? matches[0]
    if (!note) continue
    const preservedId = note.id || matches.find((copy) => copy.id)?.id
    for (const copy of matches) if (copy !== note) copy.remove()
    if (preservedId) note.id = preservedId
    claimed.set(id, note)
  }
  return claimed
}

export function drawSideNotes(placed: readonly PageSideNotes[], config: DrawConfig, entries: PreflightEntry[], doc: Document): void {
  const claimed = claimSideNotes(placed, doc)
  const pages = doc.querySelectorAll(`[${config.pageMarker}]`)
  for (const page of pages) {
    const index = Number(page.getAttribute(config.pageMarker)) - 1
    drawPageSideNotes(placed[index], page as HTMLElement, config, entries, doc, claimed)
  }
}

export function drawMarginContent(measurements: Measurements, plan: Plan, config: DrawConfig, entries: PreflightEntry[], doc: Document): void {
  if (config.lineNumbers) drawLineNumbers(numberLines(measurements, plan, config.lineNumbers), { ...config, area: config.lineNumbers.area }, entries, doc)
  if (config.sideNotes) drawSideNotes(placeSideNotes(measurements, plan, config.sideNotes, config.direction), config, entries, doc)
}

export function drawPageLineNumbers(
  held: PageLineNumbers | undefined,
  page: HTMLElement | undefined,
  config: DrawConfig,
  entries: PreflightEntry[],
  doc: Document,
): void {
  if (!held || !page || held.lines.length === 0) return
  const text = page.querySelector('[data-segnavia-text]') as HTMLElement | null
  if (!text) return
  const container = doc.createElement('div')
  container.setAttribute('data-segnavia-line-numbers', '')
  container.setAttribute('data-segnavia-area', config.area)
  container.setAttribute('aria-hidden', 'true')
  const textRect = text.getBoundingClientRect()
  const pageRect = page.getBoundingClientRect()
  const geometryName = page.getAttribute('data-segnavia-page-geometry')
  const geometry = config.geometries.find((candidate) => (candidate.name ?? null) === geometryName) ?? config.geometries[0]
  const gap = geometry?.columnGap ?? 0
  for (const line of held.lines) container.append(createLineNumber(line, config, textRect, pageRect, gap, doc))
  text.append(container)
  const furniture = page.querySelectorAll('[data-segnavia-region]')
  const folio = page.getAttribute('data-segnavia-folio') || ''
  held.lines.forEach((line, index) => {
    const drawn = container.children[index] as HTMLElement | undefined
    if (!drawn) return
    const rect = drawn.getBoundingClientRect()
    const crossed = crossedLimit(rect, pageRect, furniture, line, config.area, config.direction, gap)
    if (crossed) appendMarginOverset(entries, line, crossed, folio)
    if (config.area === 'margin') {
      for (let previous = 0; previous < index; previous += 1) {
        const earlier = container.children[previous] as HTMLElement | undefined
        if (earlier && intersects(rect, earlier.getBoundingClientRect())) {
          appendMarginOverset(entries, line, `line number ${held.lines[previous]?.value ?? ''}`, folio)
          break
        }
      }
    }
  })
}
