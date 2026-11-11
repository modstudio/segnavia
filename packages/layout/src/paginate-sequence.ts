import { paginateColumns } from './paginate-columns.ts'
import { internalWindowEdge } from './paginate-extent.ts'
import type {
  PaginateBlock,
  PaginateBookInput,
  PaginateBookPage,
  PaginateBookRefusal,
  PaginateBookResult,
  PaginateFlow,
  PaginatePageFill,
  PaginatePageNote,
  PaginateSequence,
  PaginateUnit,
} from './paginate-types.ts'
import { finishedPaginateResult, initialParentSelection } from './parent-selection.ts'
import type { BookPrintedPagePlan } from './printed-pages.ts'

export function paginateSequence(
  input: PaginateBookInput,
  fillPage: (units: PaginateUnit[], index: number, pending: PaginatePageNote[], textHeight: number, textArea?: string) => PaginatePageFill,
  faceOf: (index: number, direction: 'ltr' | 'rtl') => { face: 'recto' | 'verso'; side: 'left' | 'right' },
): PaginateBookResult {
  function selected(flow: PaginateFlow, opening: boolean, blank: boolean, role: 'body' | 'fixed' | undefined, pageIndex: number, rules = flow.parentRules) {
    return initialParentSelection(flow, { opening, blank, ...(role ? { role } : {}), pageIndex, ...(rules ? { rules } : {}) }, input.settings.direction, faceOf)
  }

  function pageHeight(flow: PaginateFlow, parent: string): number {
    return (flow.pageGeometry === undefined ? undefined : input.geometryParents?.[flow.pageGeometry]?.[parent]?.height) ?? input.parents[parent]?.height ?? 0
  }

  function notesOnlyOpeningPage(page: PaginatePageFill, opener: boolean): boolean {
    return opener && page.placed.length === 0 && page.fragments.length > 0 && !page.refusal
  }
  function columnRefusal(block: PaginateBlock): PaginateBookRefusal | undefined {
    const ceiling = 12
    const count = block.columns
    if (count === undefined) return undefined
    if (Number.isInteger(count) && count >= 1 && count <= ceiling) return undefined
    const position = `chapter ${block.position.chapter} block ${block.position.block}`
    return {
      tag: block.tag,
      position: block.position,
      message: `The ${block.tag} at ${position} could not establish a column count; use an integer from 1 to 12 to clear this refusal.`,
    }
  }

  function pagesRefusal(flow: PaginateFlow): PaginateBookRefusal | undefined {
    if (flow.kind !== 'fixed') return undefined
    if (Number.isSafeInteger(flow.pages) && flow.pages >= 0) return undefined
    return {
      flow: flow.id,
      message: `The ${flow.id} flow could not establish a page count; use a safe integer of 0 or more to clear this refusal.`,
    }
  }

  function boundsRefusal(): PaginateBookRefusal | undefined {
    for (const flow of input.flows) {
      const pages = pagesRefusal(flow)
      if (pages) return pages
      if (flow.kind === 'fixed') continue
      for (const block of flow.blocks) {
        const columns = columnRefusal(block)
        if (columns) return columns
      }
    }
  }

  function isFront(flow: PaginateFlow): boolean {
    if (flow.sequence !== undefined) return flow.sequence === 'front'
    return flow.kind === 'front' || flow.kind === 'contents'
  }

  function unitsOf(flow: PaginateFlow): PaginateUnit[] {
    if (flow.kind === 'fixed') return []
    const units: PaginateUnit[] = []
    for (const block of flow.blocks) {
      for (const [index, line] of block.lines.entries()) {
        const previous = units[units.length - 1]
        const refs = (block.footnoteRefs ?? []).filter((ref) => ref.line === index).map((ref) => ref.note)
        const unit: PaginateUnit = { flowId: flow.id, block, index, ...line, refs }
        if (previous) {
          const edge = internalWindowEdge(previous, unit)
          unit.previousEdge = edge
          previous.nextEdge = edge
        }
        units.push(unit)
      }
    }
    return units
  }

  function openingOf(flow: PaginateFlow): 'recto' | 'verso' | 'any' {
    if (flow.opens === 'recto' || flow.opens === 'verso' || flow.opens === 'any') return flow.opens
    return input.settings.rectoOpenings ? 'recto' : 'any'
  }

  function needsOpeningBlank(opens: 'recto' | 'verso' | 'any', count: number): boolean {
    const nextIsRecto = count % 2 === 0
    if (opens === 'recto') return !nextIsRecto
    if (opens === 'verso') return nextIsRecto
    return false
  }

  function makeBlank(number: number, sequence: PaginateSequence, flow: PaginateFlow, physicalIndex: number): PaginateBookPage {
    const planned = selected(flow, false, true, 'body', physicalIndex)
    return {
      kind: 'blank',
      number,
      sequence,
      flow: flow.id,
      role: 'blank',
      windows: [],
      notes: [],
      variables: {},
      blank: true,
      sectionOpening: false,
      parent: planned.parent,
      face: planned.face,
      side: planned.side,
      ...(flow.pageGeometry === undefined ? {} : { pageGeometry: flow.pageGeometry }),
    }
  }

  function makeContent(
    part: PaginateSequence,
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    planned: Pick<BookPrintedPagePlan, 'parent' | 'face' | 'side'>,
  ): PaginateBookPage {
    const layout = paginateColumns(placed)
    return {
      kind: part,
      number,
      sequence: part,
      flow: flow.id,
      role: opener ? 'opener' : 'body',
      windows: layout.windows,
      notes: fragments,
      ...(layout.headerRepeat ? { headerRepeat: layout.headerRepeat } : {}),
      blank: false,
      sectionOpening: opener,
      variables: {},
      parent: planned.parent,
      face: planned.face,
      side: planned.side,
      ...(flow.pageGeometry === undefined ? {} : { pageGeometry: flow.pageGeometry }),
    }
  }

  function makeFixed(
    part: PaginateSequence,
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    physicalIndex: number,
    rules = flow.parentRules,
  ): PaginateBookPage {
    const templated = flow.kind === 'fixed' && flow.role === 'body'
    const planned = selected(flow, opener, false, templated ? 'body' : 'fixed', physicalIndex, rules)
    return {
      kind: part,
      number,
      sequence: part,
      flow: flow.id,
      role: templated ? 'body' : 'fixed',
      windows: [],
      notes: [],
      blank: false,
      sectionOpening: opener,
      variables: {},
      parent: planned.parent,
      face: planned.face,
      side: planned.side,
      ...(flow.pageGeometry === undefined ? {} : { pageGeometry: flow.pageGeometry }),
    }
  }

  function emitPage(
    part: PaginateSequence,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    pages: PaginateBookPage[],
    planned: Pick<BookPrintedPagePlan, 'parent' | 'face' | 'side'>,
  ): void {
    pages.push(makeContent(part, pages.length + 1, flow, opener, placed, fragments, planned))
  }

  function appendFixed(flow: PaginateFlow, part: PaginateSequence, pages: PaginateBookPage[], continued: PaginatePageNote[], physicalOffset: number) {
    const count = flow.kind === 'fixed' ? flow.pages : 0
    for (let index = 0; index < count; index += 1) {
      const opener = index === 0
      pages.push(
        makeFixed(part, pages.length + 1, flow, opener, physicalOffset + pages.length + 1, flow.kind === 'fixed' ? flow.pageParentRules?.[index] : undefined),
      )
    }
    return { pending: continued }
  }

  function paginateFlowing(
    flow: Exclude<PaginateFlow, { kind: 'fixed' }>,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
    physicalOffset: number,
  ): { refusal?: PaginateBookRefusal; pending: PaginatePageNote[] } {
    const units = unitsOf(flow)
    let index = 0
    let pending = continued
    let opener = true
    while (index < units.length || pending.length > 0) {
      let planned = selected(flow, opener, false, undefined, physicalOffset + pages.length + 1)
      const height = pageHeight(flow, planned.parent)
      const textArea = opener ? `the "${planned.parent}" opener parent's ${height}px text area` : undefined
      let page = fillPage(units, index, pending, height, textArea)
      const isOpening: boolean = opener && page.placed.length > 0
      if (notesOnlyOpeningPage(page, opener)) {
        planned = selected(flow, isOpening, false, undefined, physicalOffset + pages.length + 1)
        page = fillPage(units, index, pending, pageHeight(flow, planned.parent))
      }
      if (page.refusal) return { refusal: page.refusal, pending }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return { pending }
      emitPage(part, flow, isOpening, page.placed, page.fragments, pages, planned)
      opener = opener && page.placed.length === 0
      index = page.index
      pending = page.pending
    }
    return { pending }
  }

  function paginateFlow(
    flow: PaginateFlow,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
    physicalOffset: number,
  ): { refusal?: PaginateBookRefusal; pending: PaginatePageNote[] } {
    if (flow.kind === 'fixed') return appendFixed(flow, part, pages, continued, physicalOffset)
    return paginateFlowing(flow, part, pages, continued, physicalOffset)
  }

  function flushNotes(continued: PaginatePageNote[], flow: PaginateFlow, part: PaginateSequence, pages: PaginateBookPage[], physicalOffset: number) {
    let pending = continued
    while (pending.length > 0) {
      const planned = selected(flow, false, false, 'body', physicalOffset + pages.length + 1)
      const page = fillPage([], 0, pending, pageHeight(flow, planned.parent))
      if (page.refusal) return { refusal: page.refusal }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return {}
      emitPage(part, flow, false, page.placed, page.fragments, pages, planned)
      pending = page.pending
    }
    return {}
  }

  function flushBeforeFixed(
    flow: PaginateFlow,
    previous: PaginateFlow | undefined,
    continued: PaginatePageNote[],
    part: PaginateSequence,
    pages: PaginateBookPage[],
    physicalOffset: number,
  ) {
    if (flow.kind !== 'fixed' || continued.length === 0 || !previous) return { continued }
    const flushed = flushNotes(continued, previous, part, pages, physicalOffset)
    if ('refusal' in flushed && flushed.refusal) return { refusal: flushed.refusal }
    return { continued: [] as PaginatePageNote[] }
  }

  function emitFlow(
    flow: PaginateFlow,
    previous: PaginateFlow | undefined,
    continued: PaginatePageNote[],
    part: PaginateSequence,
    pages: PaginateBookPage[],
    physicalOffset: number,
  ) {
    const held = flushBeforeFixed(flow, previous, continued, part, pages, physicalOffset)
    if ('refusal' in held && held.refusal) return { refusal: held.refusal }
    if (needsOpeningBlank(openingOf(flow), physicalOffset + pages.length))
      pages.push(makeBlank(pages.length + 1, part, flow, physicalOffset + pages.length + 1))
    const result = paginateFlow(flow, part, pages, held.continued, physicalOffset)
    if ('refusal' in result && result.refusal) return { refusal: result.refusal }
    return { continued: result.pending }
  }

  function paginatePart(flows: PaginateFlow[], part: PaginateSequence, physicalOffset = 0): PaginateBookResult {
    const pages: PaginateBookPage[] = []
    let continued: PaginatePageNote[] = []
    let previous: PaginateFlow | undefined
    for (const flow of flows) {
      const result = emitFlow(flow, previous, continued, part, pages, physicalOffset)
      if ('refusal' in result && result.refusal) return { pages, refusals: [result.refusal] }
      continued = result.continued
      previous = flow
    }
    const last = flows[flows.length - 1]
    if (last) {
      const flushed = flushNotes(continued, last, part, pages, physicalOffset)
      if ('refusal' in flushed && flushed.refusal) return { pages, refusals: [flushed.refusal] }
    }
    return { pages, refusals: [] }
  }

  const bounded = boundsRefusal()
  if (bounded) return { pages: [], refusals: [bounded] }
  const frontFlows = input.flows.filter(isFront)
  const bodyFlows = input.flows.filter((flow) => !isFront(flow))
  const front = paginatePart(frontFlows, 'front')
  const firstBody = bodyFlows[0]
  const lastFront = frontFlows[frontFlows.length - 1]
  // Under recto openings the body's first page is a recto, so its odd folios fall on rectos; otherwise only the first body section's opening pads the front.
  const padFront = input.settings.rectoOpenings
    ? front.pages.length % 2 === 1
    : firstBody !== undefined && needsOpeningBlank(openingOf(firstBody), front.pages.length)
  if (front.pages.length > 0 && lastFront && padFront) {
    front.pages.push(makeBlank(front.pages.length + 1, 'front', lastFront, front.pages.length + 1))
  }
  const body = paginatePart(bodyFlows, 'body', front.pages.length)
  return finishedPaginateResult(front, body, input)
}
