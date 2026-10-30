import { selectBookParent } from '../printed-pages.ts'
import { paginateColumns } from './paginate-columns.ts'
import { paginateMarks } from './paginate-marks.ts'
import type {
  PaginateBlock,
  PaginateBookInput,
  PaginateBookPage,
  PaginateBookRefusal,
  PaginateBookResult,
  PaginateFlow,
  PaginatePageFill,
  PaginatePageMarks,
  PaginatePageNote,
  PaginateSequence,
  PaginateUnit,
} from './paginate-types.ts'

export function paginateSequence(
  input: PaginateBookInput,
  fillPage: (units: PaginateUnit[], index: number, pending: PaginatePageNote[], textHeight: number, textArea?: string) => PaginatePageFill,
): PaginateBookResult {
  function selected(flow: PaginateFlow, opening: boolean, blank: boolean, role: 'body' | 'fixed' | undefined, pageIndex: number, parents = flow.parents) {
    const fact = { blank, sectionOpening: opening, ...(role === undefined ? {} : { role }), ...(parents === undefined ? {} : { parents }) }
    return selectBookParent(fact, pageIndex, pageIndex, input.settings.direction, input.parentNames)
  }

  function pageHeight(parent: string): number {
    return input.parents[parent]?.height ?? 0
  }

  function notesOnlyOpeningPage(page: PaginatePageFill, opener: boolean): boolean {
    return opener && page.placed.length === 0 && page.fragments.length > 0 && !page.refusal
  }
  function emptyMarks(): PaginatePageMarks {
    return Object.create(null) as PaginatePageMarks
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
    if (flow.kind === 'fixed') return flow.sequence === 'front'
    return flow.kind === 'front' || flow.kind === 'contents'
  }

  function unitsOf(flow: PaginateFlow): PaginateUnit[] {
    if (flow.kind === 'fixed') return []
    const units: PaginateUnit[] = []
    for (const block of flow.blocks) {
      for (const [index, line] of block.lines.entries()) {
        const previous = units[units.length - 1]
        const refs = (block.footnoteRefs ?? []).filter((ref) => ref.line === index).map((ref) => ref.note)
        const unit: PaginateUnit = { flowId: flow.id, block, index, top: line.top, bottom: line.bottom, refs }
        if (previous) {
          unit.prevBottom = previous.bottom
          previous.nextTop = line.top
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
      blank: true,
      sectionOpening: false,
      parent: planned.parent,
      side: planned.side,
    }
  }

  function makeContent(
    part: PaginateSequence,
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    marks: PaginatePageMarks,
    planned: { parent: string; side: 'left' | 'right' },
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
      ...(opener || flow.runningHead === undefined ? {} : { runningHead: flow.runningHead }),
      ...(flow.parts === undefined ? {} : { parts: flow.parts }),
      marks,
      parent: planned.parent,
      side: planned.side,
    }
  }

  function makeFixed(
    part: PaginateSequence,
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    marks: PaginatePageMarks,
    physicalIndex: number,
    parents = flow.parents,
  ): PaginateBookPage {
    const templated = flow.kind === 'fixed' && flow.role === 'body'
    const planned = selected(flow, opener, false, templated ? 'body' : 'fixed', physicalIndex, parents)
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
      ...((opener && !templated) || flow.runningHead === undefined ? {} : { runningHead: flow.runningHead }),
      ...(flow.parts === undefined ? {} : { parts: flow.parts }),
      marks,
      parent: planned.parent,
      side: planned.side,
    }
  }

  function emitMarked(
    part: PaginateSequence,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    pages: PaginateBookPage[],
    carried: PaginatePageMarks,
    planned: { parent: string; side: 'left' | 'right' },
  ): PaginatePageMarks {
    const marked = paginateMarks(placed, carried)
    pages.push(makeContent(part, pages.length + 1, flow, opener, placed, fragments, marked.marks, planned))
    return marked.carried
  }

  function appendFixed(
    flow: PaginateFlow,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
    carried: PaginatePageMarks,
    physicalOffset: number,
  ) {
    const count = flow.kind === 'fixed' ? flow.pages : 0
    let next = carried
    for (let index = 0; index < count; index += 1) {
      const opener = index === 0
      const marked = paginateMarks([], next)
      next = marked.carried
      pages.push(
        makeFixed(
          part,
          pages.length + 1,
          flow,
          opener,
          marked.marks,
          physicalOffset + pages.length + 1,
          flow.kind === 'fixed' ? flow.pageParents?.[index] : undefined,
        ),
      )
    }
    return { pending: continued, carried: next }
  }

  function paginateFlowing(
    flow: Exclude<PaginateFlow, { kind: 'fixed' }>,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
    carried: PaginatePageMarks,
    physicalOffset: number,
  ): { refusal?: PaginateBookRefusal; pending: PaginatePageNote[]; carried: PaginatePageMarks } {
    const units = unitsOf(flow)
    let index = 0
    let pending = continued
    let opener = true
    let nextCarried = carried
    while (index < units.length || pending.length > 0) {
      let planned = selected(flow, opener, false, undefined, physicalOffset + pages.length + 1)
      const height = pageHeight(planned.parent)
      const textArea = opener ? `the "${planned.parent}" opener parent's ${height}px text area` : undefined
      let page = fillPage(units, index, pending, height, textArea)
      const isOpening: boolean = opener && page.placed.length > 0
      if (notesOnlyOpeningPage(page, opener)) {
        planned = selected(flow, isOpening, false, undefined, physicalOffset + pages.length + 1)
        page = fillPage(units, index, pending, pageHeight(planned.parent))
      }
      if (page.refusal) return { refusal: page.refusal, pending, carried: nextCarried }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return { pending, carried: nextCarried }
      nextCarried = emitMarked(part, flow, isOpening, page.placed, page.fragments, pages, nextCarried, planned)
      opener = opener && page.placed.length === 0
      index = page.index
      pending = page.pending
    }
    return { pending, carried: nextCarried }
  }

  function paginateFlow(
    flow: PaginateFlow,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
    carried: PaginatePageMarks,
    physicalOffset: number,
  ): { refusal?: PaginateBookRefusal; pending: PaginatePageNote[]; carried: PaginatePageMarks } {
    if (flow.kind === 'fixed') return appendFixed(flow, part, pages, continued, carried, physicalOffset)
    return paginateFlowing(flow, part, pages, continued, carried, physicalOffset)
  }

  function flushNotes(
    continued: PaginatePageNote[],
    flow: PaginateFlow,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    carried: PaginatePageMarks,
    physicalOffset: number,
  ) {
    let pending = continued
    let nextCarried = carried
    while (pending.length > 0) {
      const planned = selected(flow, false, false, 'body', physicalOffset + pages.length + 1)
      const page = fillPage([], 0, pending, pageHeight(planned.parent))
      if (page.refusal) return { refusal: page.refusal, carried: nextCarried }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return { carried: nextCarried }
      nextCarried = emitMarked(part, flow, false, page.placed, page.fragments, pages, nextCarried, planned)
      pending = page.pending
    }
    return { carried: nextCarried }
  }

  function flushBeforeFixed(
    flow: PaginateFlow,
    previous: PaginateFlow | undefined,
    continued: PaginatePageNote[],
    carried: PaginatePageMarks,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    physicalOffset: number,
  ) {
    if (flow.kind !== 'fixed' || continued.length === 0 || !previous) return { continued, carried }
    const flushed = flushNotes(continued, previous, part, pages, carried, physicalOffset)
    if ('refusal' in flushed && flushed.refusal) return { refusal: flushed.refusal }
    return { continued: [] as PaginatePageNote[], carried: flushed.carried }
  }

  function emitFlow(
    flow: PaginateFlow,
    previous: PaginateFlow | undefined,
    continued: PaginatePageNote[],
    carried: PaginatePageMarks,
    part: PaginateSequence,
    pages: PaginateBookPage[],
    physicalOffset: number,
  ) {
    const held = flushBeforeFixed(flow, previous, continued, carried, part, pages, physicalOffset)
    if ('refusal' in held && held.refusal) return { refusal: held.refusal }
    if (needsOpeningBlank(openingOf(flow), physicalOffset + pages.length))
      pages.push(makeBlank(pages.length + 1, part, flow, physicalOffset + pages.length + 1))
    const result = paginateFlow(flow, part, pages, held.continued, held.carried, physicalOffset)
    if ('refusal' in result && result.refusal) return { refusal: result.refusal }
    return { continued: result.pending, carried: result.carried }
  }

  function paginatePart(flows: PaginateFlow[], part: PaginateSequence, physicalOffset = 0): PaginateBookResult {
    const pages: PaginateBookPage[] = []
    let continued: PaginatePageNote[] = []
    let carried: PaginatePageMarks = emptyMarks()
    let previous: PaginateFlow | undefined
    for (const flow of flows) {
      const result = emitFlow(flow, previous, continued, carried, part, pages, physicalOffset)
      if ('refusal' in result && result.refusal) return { pages, refusals: [result.refusal] }
      continued = result.continued
      carried = result.carried
      previous = flow
    }
    const last = flows[flows.length - 1]
    if (last) {
      const flushed = flushNotes(continued, last, part, pages, carried, physicalOffset)
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
  if (body.refusals.length > 0) return { pages: [...front.pages, ...body.pages], refusals: body.refusals }
  if (front.refusals.length > 0) return { pages: [...front.pages, ...body.pages], refusals: front.refusals }
  return { pages: [...front.pages, ...body.pages], refusals: [] }
}
