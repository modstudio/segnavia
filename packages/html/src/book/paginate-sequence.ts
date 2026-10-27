import { paginateColumns } from './paginate-columns.ts'
import { paginateMarks } from './paginate-marks.ts'
import type {
  PaginateBookInput,
  PaginateBookPage,
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
  fillPage: (units: PaginateUnit[], index: number, pending: PaginatePageNote[]) => PaginatePageFill,
): PaginateBookResult {
  function isFront(flow: PaginateFlow): boolean {
    return flow.kind === 'front' || flow.kind === 'contents'
  }

  function unitsOf(flow: PaginateFlow): PaginateUnit[] {
    if (flow.kind === 'fixed') return []
    const units: PaginateUnit[] = []
    for (const block of flow.blocks) {
      for (const [index, line] of block.lines.entries()) {
        const refs = (block.footnoteRefs ?? []).filter((ref) => ref.line === index).map((ref) => ref.note)
        units.push({ flowId: flow.id, block, index, top: line.top, bottom: line.bottom, refs })
      }
    }
    return units
  }

  function makeBlank(number: number, sequence: PaginateSequence, flowId: string): PaginateBookPage {
    return { kind: 'blank', number, sequence, flow: flowId, role: 'blank', windows: [], notes: [], blank: true, sectionOpening: false }
  }

  function makeContent(
    part: PaginateSequence,
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    marks: PaginatePageMarks,
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
      marks,
    }
  }

  function makeFixed(part: PaginateSequence, number: number, flow: PaginateFlow, opener: boolean, marks: PaginatePageMarks): PaginateBookPage {
    return {
      kind: part,
      number,
      sequence: part,
      flow: flow.id,
      role: 'fixed',
      windows: [],
      notes: [],
      blank: false,
      sectionOpening: opener,
      ...(opener || flow.runningHead === undefined ? {} : { runningHead: flow.runningHead }),
      marks,
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
  ): PaginatePageMarks {
    const marked = paginateMarks(placed, carried)
    pages.push(makeContent(part, pages.length + 1, flow, opener, placed, fragments, marked.marks))
    return marked.carried
  }

  function appendFixed(flow: PaginateFlow, part: PaginateSequence, pages: PaginateBookPage[], continued: PaginatePageNote[], carried: PaginatePageMarks) {
    const count = flow.kind === 'fixed' ? flow.pages : 0
    let next = carried
    for (let index = 0; index < count; index += 1) {
      const opener = index === 0
      const marked = paginateMarks([], next)
      next = marked.carried
      pages.push(makeFixed(part, pages.length + 1, flow, opener, marked.marks))
    }
    return { pending: continued, carried: next }
  }

  function paginateFlow(flow: PaginateFlow, part: PaginateSequence, pages: PaginateBookPage[], continued: PaginatePageNote[], carried: PaginatePageMarks) {
    if (flow.kind === 'fixed') return appendFixed(flow, part, pages, continued, carried)
    const units = unitsOf(flow)
    let index = 0
    let pending = continued
    let opener = true
    let nextCarried = carried
    while (index < units.length || pending.length > 0) {
      const page = fillPage(units, index, pending)
      if (page.refusal) return { refusal: page.refusal, pending, carried: nextCarried }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return { pending, carried: nextCarried }
      nextCarried = emitMarked(part, flow, opener && page.placed.length > 0, page.placed, page.fragments, pages, nextCarried)
      opener = opener && page.placed.length === 0
      index = page.index
      pending = page.pending
    }
    return { pending, carried: nextCarried }
  }

  function flushNotes(continued: PaginatePageNote[], flow: PaginateFlow, part: PaginateSequence, pages: PaginateBookPage[], carried: PaginatePageMarks) {
    let pending = continued
    let nextCarried = carried
    while (pending.length > 0) {
      const page = fillPage([], 0, pending)
      if (page.refusal) return { refusal: page.refusal, carried: nextCarried }
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return { carried: nextCarried }
      nextCarried = emitMarked(part, flow, false, page.placed, page.fragments, pages, nextCarried)
      pending = page.pending
    }
    return { carried: nextCarried }
  }

  function paginatePart(flows: PaginateFlow[], part: PaginateSequence): PaginateBookResult {
    const pages: PaginateBookPage[] = []
    let continued: PaginatePageNote[] = []
    let carried: PaginatePageMarks = {}
    for (const flow of flows) {
      if (part === 'body' && input.settings.rectoOpenings && pages.length % 2 === 1) pages.push(makeBlank(pages.length + 1, part, flow.id))
      const result = paginateFlow(flow, part, pages, continued, carried)
      if ('refusal' in result && result.refusal) return { pages, refusals: [result.refusal] }
      continued = result.pending
      carried = result.carried
    }
    const last = flows[flows.length - 1]
    if (last) {
      const flushed = flushNotes(continued, last, part, pages, carried)
      if ('refusal' in flushed && flushed.refusal) return { pages, refusals: [flushed.refusal] }
    }
    if (part === 'front' && input.settings.rectoOpenings && pages.length % 2 === 1) {
      pages.push(makeBlank(pages.length + 1, part, last?.id ?? ''))
    }
    return { pages, refusals: [] }
  }

  const body = paginatePart(
    input.flows.filter((flow) => !isFront(flow)),
    'body',
  )
  if (body.refusals.length > 0) return body
  const front = paginatePart(
    input.flows.filter((flow) => isFront(flow)),
    'front',
  )
  if (front.refusals.length > 0) return { pages: [...front.pages, ...body.pages], refusals: front.refusals }
  return { pages: [...front.pages, ...body.pages], refusals: [] }
}
