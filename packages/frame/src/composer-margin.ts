import { type Measurements, type Plan, type PreflightEntry, resolveDirection, type SideNotes } from '@segnavia/format'
import { type NumberedLine, numberLines, type PageLineNumbers, type PageSideNotes, placeSideNotes, stackDownward } from '@segnavia/layout'

interface DrawConfig {
  area: 'text' | 'margin'
  direction: 'ltr' | 'rtl'
  geometries: ReadonlyArray<{ name?: string; columnGap: number }>
  pageMarker: string
  dir?: 'ltr' | 'rtl' | 'auto'
  lang?: string
  lineNumbers?: Parameters<typeof numberLines>[2]
  sideNotes?: SideNotes
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
  if (rect.left < pageRect.left || rect.right > pageRect.right || rect.top < pageRect.top || rect.bottom > pageRect.bottom) return 'the page edge'
  for (const held of furniture) {
    if (intersects(rect, held.getBoundingClientRect())) return `region ${held.getAttribute('data-segnavia-region') || 'furniture'}`
  }
  const interior = lineNumberEdge(source, direction) === 'interior'
  return area === 'text' && source.columns > 1 && interior && rect.width > gap ? 'the column gap' : ''
}

export function appendMarginOverset(entries: PreflightEntry[], source: NumberedLine, crossed: string, folio: string): void {
  const subject = `line:${source.value}`
  if (entries.some((entry) => entry.check === 'margin-overset' && entry.subject === subject && entry.location?.folio === folio)) return
  entries.push({
    check: 'margin-overset',
    subject,
    message: `Line number ${source.value} crosses ${crossed}; change lineNumbers.area or lineNumbers.side, or widen the margin or column gap to clear it.`,
    location: { folio },
  })
}

export function appendSideNoteOverset(entries: PreflightEntry[], id: string, crossed: string, folio: string): void {
  const subject = `side-note:${id}`
  if (entries.some((entry) => entry.check === 'margin-overset' && entry.subject === subject && entry.location?.folio === folio)) return
  entries.push({
    check: 'margin-overset',
    subject,
    message: `Side note ${id} crosses ${crossed}; move the note, shorten it, change sideNotes.side, or widen the margin to clear it.`,
    location: { folio },
  })
}

export function matchingSideNote(root: ParentNode, id: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll('[data-side-note][data-segnavia-id]')).find((candidate) => candidate.getAttribute('data-segnavia-id') === id) as
    | HTMLElement
    | undefined
}

export function widestLineNumber(page: HTMLElement, side: 'left' | 'right'): number {
  let width = 0
  for (const number of page.querySelectorAll(`[data-segnavia-line-number][data-segnavia-side="${side}"]`)) {
    width = Math.max(width, number.getBoundingClientRect().width)
  }
  return width
}

export function drawPageSideNotes(
  held: PageSideNotes | undefined,
  page: HTMLElement | undefined,
  config: DrawConfig,
  entries: PreflightEntry[],
  doc: Document,
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
  const drawn: Array<{ id: string; top: number; side: 'left' | 'right'; element: HTMLElement }> = []
  for (const placement of held.notes) {
    const note = matchingSideNote(page, placement.id)
    if (!note) continue
    let preservedId = note.id
    const copies = Array.from(doc.querySelectorAll('[data-side-note][data-segnavia-id]')).filter(
      (candidate) => candidate.getAttribute('data-segnavia-id') === placement.id,
    ) as HTMLElement[]
    for (const copy of copies) if (!preservedId && copy.id) preservedId = copy.id
    for (const copy of copies) if (copy !== note) copy.remove()
    if (preservedId) note.id = preservedId
    if (!note.hasAttribute('dir')) note.setAttribute('dir', resolveDirection(undefined, note.getAttribute('lang') ?? config.lang, note.textContent ?? ''))
    note.setAttribute('data-segnavia-side', placement.side)
    note.style.top = `${placement.top}px`
    const reserve = widestLineNumber(page, placement.side) + gap
    if (placement.side === 'left') {
      note.style.left = `${pageRect.left - textRect.left + reserve}px`
      note.style.width = `${Math.max(0, textRect.left - pageRect.left - gap - reserve)}px`
    } else {
      note.style.left = `${textRect.width + gap}px`
      note.style.width = `${Math.max(0, pageRect.right - textRect.right - gap - reserve)}px`
    }
    container.append(note)
    drawn.push({ id: placement.id, top: placement.top, side: placement.side, element: note })
  }
  text.append(container)
  const furniture = page.querySelectorAll('[data-segnavia-region]')
  const numbers = page.querySelectorAll('[data-segnavia-line-number]')
  const folio = page.getAttribute('data-segnavia-folio') || ''
  for (const side of ['left', 'right'] as const) {
    const items = drawn.filter((item) => item.side === side).sort((a, b) => a.top - b.top)
    const tops = stackDownward(
      items.map((item) => ({ top: item.top, height: item.element.getBoundingClientRect().height })),
      gap,
    )
    items.forEach((item, index) => {
      item.element.style.top = `${tops[index] ?? item.top}px`
      const rect = item.element.getBoundingClientRect()
      let crossed = rect.left < pageRect.left || rect.right > pageRect.right || rect.top < pageRect.top || rect.bottom > pageRect.bottom ? 'the page edge' : ''
      for (const region of furniture) if (!crossed && intersects(rect, region.getBoundingClientRect())) crossed = `region ${region.getAttribute('data-segnavia-region') || 'furniture'}`
      for (const number of numbers) if (!crossed && intersects(rect, number.getBoundingClientRect())) crossed = `line number ${number.getAttribute('data-segnavia-line-number') || ''}`
      if (crossed) appendSideNoteOverset(entries, item.id, crossed, folio)
    })
  }
}

export function drawSideNotes(placed: ReturnType<typeof placeSideNotes>, config: DrawConfig, entries: PreflightEntry[], doc: Document): void {
  const pages = doc.querySelectorAll(`[${config.pageMarker}]`)
  for (const page of pages) {
    const index = Number(page.getAttribute(config.pageMarker)) - 1
    drawPageSideNotes(placed[index], page as HTMLElement, config, entries, doc)
  }
}

export function drawMarginContent(measurements: Measurements, plan: Plan, config: DrawConfig, entries: PreflightEntry[], doc: Document): void {
  if (config.lineNumbers) drawLineNumbers(numberLines(measurements, plan, config.lineNumbers), { ...config, area: config.lineNumbers.area }, entries, doc)
  if (config.sideNotes) drawSideNotes(placeSideNotes(measurements, plan, config.sideNotes), config, entries, doc)
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
