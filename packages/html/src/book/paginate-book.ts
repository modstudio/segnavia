import type {
  PaginateBlock,
  PaginateBookInput,
  PaginateBookPage,
  PaginateBookRefusal,
  PaginateBookResult,
  PaginateFlow,
  PaginateNumberSystem,
  PaginatePageFill,
  PaginatePageNote,
  PaginateUnit,
  PaginateWindow,
} from './paginate-types.ts'

// Nested so a frame can embed this function with toString().
export function paginateBook(input: PaginateBookInput): PaginateBookResult {
  const textHeight = input.geometry.textHeight
  const notesGap = input.geometry.notesGap
  const orphans = input.settings.orphans ?? 2
  const widows = input.settings.widows ?? 2
  const notesById = new Map(input.notes.map((note) => [note.id, note]))

  function hebrewFolio(value: number): string {
    const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
    const thousands = Math.floor(value / 1000)
    const rest = value % 1000
    const prefix = thousands === 0 ? '' : `${ones[thousands]}׳`
    const hundreds = 'ת'.repeat(Math.floor(rest / 400))
    const under = rest % 400
    const letter = ['', 'ק', 'ר', 'ש'][Math.floor(under / 100)]
    const remainder = under % 100
    if (remainder === 15) return `${prefix}${hundreds}${letter}טו`
    if (remainder === 16) return `${prefix}${hundreds}${letter}טז`
    return `${prefix}${hundreds}${letter}${tens[Math.floor(remainder / 10)]}${ones[remainder % 10]}`
  }

  function romanFolio(value: number): string {
    const names = 'M CM D CD C XC L XL X IX V IV I'.split(' ')
    const amounts = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
    let remaining = value
    let result = ''
    for (const [index, amount] of amounts.entries()) {
      while (remaining >= amount) {
        result += names[index]
        remaining -= amount
      }
    }
    return result
  }

  function formatFolio(value: number, system: PaginateNumberSystem): string {
    if (system === 'arabic') return String(value)
    if (system === 'hebrew') return hebrewFolio(value)
    return system === 'roman-lower' ? romanFolio(value).toLowerCase() : romanFolio(value)
  }

  function blockHeight(block: PaginateBlock): number {
    const first = block.lines[0]
    const last = block.lines[block.lines.length - 1]
    return first && last ? last.bottom - first.top : 0
  }

  function fragmentHeight(fragment: PaginatePageNote): number {
    const note = notesById.get(fragment.id)
    const start = note?.lines[fragment.start]
    const end = note?.lines[fragment.end - 1]
    return start && end ? end.bottom - start.top : 0
  }

  function notesSpace(fragments: PaginatePageNote[]): number {
    if (fragments.length === 0) return 0
    let height = 0
    for (const fragment of fragments) height += fragmentHeight(fragment)
    return notesGap + height
  }

  function headerFor(placed: PaginateUnit[]): number {
    const first = placed[0]
    if (first?.block.kind !== 'table' || first.index === 0) return 0
    return first.block.headerHeight ?? 0
  }

  function used(placed: PaginateUnit[], fragments: PaginatePageNote[]): number {
    const first = placed[0]
    const last = placed[placed.length - 1]
    if (!first || !last) return notesSpace(fragments)
    return headerFor(placed) + (last.bottom - first.top) + notesSpace(fragments)
  }

  function sameBlock(left: PaginateBlock, right: PaginateBlock): boolean {
    return left.position.chapter === right.position.chapter && left.position.block === right.position.block
  }

  function keepWithNext(block: PaginateBlock): boolean {
    return block.kind === 'heading' || Boolean(block.keepWithNext)
  }

  function keepTogether(block: PaginateBlock): boolean {
    if (block.kind === 'table' && blockHeight(block) > textHeight) return false
    return block.kind === 'figure' || block.kind === 'table' || Boolean(block.keepTogether)
  }

  function unitsOf(flow: PaginateFlow): PaginateUnit[] {
    const units: PaginateUnit[] = []
    for (const block of flow.blocks) {
      for (const [index, line] of block.lines.entries()) {
        const refs = (block.footnoteRefs ?? []).filter((ref) => ref.line === index).map((ref) => ref.note)
        units.push({ flowId: flow.id, block, index, top: line.top, bottom: line.bottom, refs })
      }
    }
    return units
  }

  function noteEnd(id: string): number {
    return notesById.get(id)?.lines.length ?? 0
  }

  function makeFragment(id: string, start: number, end: number): PaginatePageNote {
    return { id, whole: start === 0 && end === noteEnd(id), start, end }
  }

  function takeContinued(continued: PaginatePageNote[]): { fragments: PaginatePageNote[]; leftover: PaginatePageNote[] } {
    if (continued.length === 0) return { fragments: [], leftover: [] }
    const fragments: PaginatePageNote[] = []
    const leftover: PaginatePageNote[] = []
    let pending = true
    for (const item of continued) {
      const total = noteEnd(item.id)
      if (!pending) {
        leftover.push(item)
        continue
      }
      const whole = makeFragment(item.id, item.start, total)
      if (used([], [...fragments, whole]) <= textHeight) {
        fragments.push(whole)
        continue
      }
      let end = item.start
      while (end < total && used([], [...fragments, makeFragment(item.id, item.start, end + 1)]) <= textHeight) end += 1
      if (end > item.start) fragments.push(makeFragment(item.id, item.start, end))
      if (end < total) leftover.push(makeFragment(item.id, end, total))
      pending = false
    }
    return { fragments, leftover }
  }

  function fitNote(trial: PaginateUnit[], fragments: PaginatePageNote[], id: string): PaginatePageNote | undefined {
    const total = noteEnd(id)
    if (total === 0) return undefined
    const whole = makeFragment(id, 0, total)
    if (used(trial, [...fragments, whole]) <= textHeight) return whole
    const minimum = Math.min(2, total)
    if (used(trial, [...fragments, makeFragment(id, 0, minimum)]) > textHeight) return undefined
    let end = minimum
    while (end < total && used(trial, [...fragments, makeFragment(id, 0, end + 1)]) <= textHeight) end += 1
    return makeFragment(id, 0, end)
  }

  function allocateNotes(placed: PaginateUnit[], existing: PaginatePageNote[], unit: PaginateUnit): PaginatePageNote[] | undefined {
    const trial = [...placed, unit]
    if (used(trial, existing) > textHeight) return undefined
    const fragments = existing.slice()
    for (const id of unit.refs) {
      if (fragments.some((fragment) => fragment.id === id)) continue
      const fragment = fitNote(trial, fragments, id)
      if (!fragment) return undefined
      fragments.push(fragment)
    }
    return fragments
  }

  function countOf(placed: PaginateUnit[], block: PaginateBlock): number {
    let count = 0
    for (const unit of placed) if (sameBlock(unit.block, block)) count += 1
    return count
  }

  function dropBlock(placed: PaginateUnit[], block: PaginateBlock): PaginateUnit[] {
    return placed.filter((unit) => !sameBlock(unit.block, block))
  }

  function kept(dropped: PaginateUnit[]): PaginateUnit[] | undefined {
    return dropped.length === 0 ? undefined : dropped
  }

  function rewindTogether(placed: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    if (!keepTogether(last.block) || countOf(placed, last.block) >= last.block.lines.length) return undefined
    return kept(dropBlock(placed, last.block))
  }

  function rewindOrphans(placed: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.kind === 'table' || block.kind === 'figure') return undefined
    const held = countOf(placed, block)
    const starts = placed.some((unit) => sameBlock(unit.block, block) && unit.index === 0)
    if (!starts || held >= block.lines.length || held >= orphans) return undefined
    return kept(dropBlock(placed, block))
  }

  function rewindWidows(placed: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.kind === 'table' || block.kind === 'figure') return undefined
    const remaining = block.lines.length - last.index - 1
    if (remaining <= 0 || remaining >= widows) return undefined
    const need = widows - remaining
    return kept(countOf(placed, block) - need <= 0 ? dropBlock(placed, block) : placed.slice(0, placed.length - need))
  }

  function rewindHeading(placed: PaginateUnit[], last: PaginateUnit, next: PaginateUnit | undefined): PaginateUnit[] | undefined {
    const other = !next || !sameBlock(next.block, last.block)
    if (!keepWithNext(last.block) || countOf(placed, last.block) !== last.block.lines.length || !other) return undefined
    return kept(dropBlock(placed, last.block))
  }

  function applyKeeps(placed: PaginateUnit[], next: PaginateUnit | undefined): PaginateUnit[] {
    let result = placed
    for (let pass = 0; pass < 8; pass += 1) {
      const last = result[result.length - 1]
      if (!last) return result
      const nextResult = rewindTogether(result, last) ?? rewindOrphans(result, last) ?? rewindWidows(result, last) ?? rewindHeading(result, last, next)
      if (!nextResult) return result
      result = nextResult
    }
    return result
  }

  function leftoverFrom(fragments: PaginatePageNote[]): PaginatePageNote[] {
    return fragments.flatMap((fragment) => (fragment.end < noteEnd(fragment.id) ? [makeFragment(fragment.id, fragment.end, noteEnd(fragment.id))] : []))
  }

  function refusal(block: PaginateBlock): PaginateBookRefusal {
    const position = `chapter ${block.position.chapter} block ${block.position.block}`
    return {
      tag: block.tag,
      position: block.position,
      message: `The ${block.tag} at ${position} could not establish a fit in the text area; shorten it or increase the text-area height to clear this refusal.`,
    }
  }

  function windowOf(placed: PaginateUnit[]): PaginateWindow[] {
    const first = placed[0]
    const last = placed[placed.length - 1]
    if (!first || !last) return []
    return [{ flow: first.flowId, start: first.top, end: last.bottom }]
  }

  function blankPage(number: number): PaginateBookPage {
    return { kind: 'blank', number, windows: [], notes: [], blank: true, sectionOpening: false }
  }

  function contentPage(
    part: 'front' | 'body',
    number: number,
    flow: PaginateFlow,
    opener: boolean,
    placed: PaginateUnit[],
    fragments: PaginatePageNote[],
    sequence: PaginateNumberSystem,
  ): PaginateBookPage {
    const headerRepeat = headerFor(placed)
    return {
      kind: part,
      number,
      windows: windowOf(placed),
      notes: fragments,
      ...(headerRepeat ? { headerRepeat } : {}),
      blank: false,
      sectionOpening: opener,
      folio: formatFolio(number, sequence),
      ...(opener || flow.runningHead === undefined ? {} : { runningHead: flow.runningHead }),
    }
  }

  function oversized(unit: PaginateUnit): boolean {
    return unit.index === 0 && unit.block.kind !== 'table' && keepTogether(unit.block) && blockHeight(unit.block) > textHeight
  }

  function greedyFill(placed: PaginateUnit[], fragments: PaginatePageNote[], units: PaginateUnit[], index: number) {
    let next = index
    let notes = fragments
    while (next < units.length) {
      const unit = units[next]
      if (!unit) break
      const allocated = allocateNotes(placed, notes, unit)
      if (!allocated) break
      placed.push(unit)
      notes = allocated
      next += 1
    }
    return { placed, fragments: notes, index: next }
  }

  function notesFor(placed: PaginateUnit[], seed: PaginatePageNote[]): PaginatePageNote[] {
    let fragments = seed
    for (const [offset, unit] of placed.entries()) {
      const allocated = allocateNotes(placed.slice(0, offset), fragments, unit)
      if (!allocated) break
      fragments = allocated
    }
    return fragments
  }

  function forcePlace(unit: PaginateUnit): PaginatePageFill {
    if (blockHeight(unit.block) > textHeight && unit.block.kind !== 'table') {
      return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    }
    const allocated = allocateNotes([], [], unit)
    if (!allocated) return { placed: [], fragments: [], index: 0, pending: [], refusal: refusal(unit.block) }
    return { placed: [unit], fragments: allocated, index: 0, pending: [] }
  }

  function fillPage(units: PaginateUnit[], index: number, pending: PaginatePageNote[]): PaginatePageFill {
    const held = takeContinued(pending)
    const incoming = units[index]
    if (held.leftover.length === 0 && incoming && oversized(incoming)) {
      return { placed: [], fragments: [], index, pending, refusal: refusal(incoming.block) }
    }
    if (held.leftover.length > 0) return { placed: [], fragments: held.fragments, index, pending: held.leftover }
    const filled = greedyFill([], held.fragments, units, index)
    const placed = applyKeeps(filled.placed, units[filled.index])
    const nextIndex = filled.index - (filled.placed.length - placed.length)
    const fragments = notesFor(placed, held.fragments)
    if (placed.length > 0 || fragments.length > 0) return { placed, fragments, index: nextIndex, pending: leftoverFrom(fragments) }
    const unit = units[nextIndex]
    if (!unit) return { placed: [], fragments: [], index: nextIndex, pending, done: true }
    const forced = forcePlace(unit)
    if (forced.refusal) return forced
    return { placed: forced.placed, fragments: forced.fragments, index: nextIndex + 1, pending: leftoverFrom(forced.fragments) }
  }

  function paginateFlow(
    flow: PaginateFlow,
    part: 'front' | 'body',
    sequence: PaginateNumberSystem,
    pages: PaginateBookPage[],
    continued: PaginatePageNote[],
  ): PaginateBookRefusal | PaginatePageNote[] {
    const units = unitsOf(flow)
    let index = 0
    let pending = continued
    let opener = true
    while (index < units.length || pending.length > 0) {
      const page = fillPage(units, index, pending)
      if (page.refusal) return page.refusal
      if (page.done || (page.placed.length === 0 && page.fragments.length === 0)) return pending
      pages.push(contentPage(part, pages.length + 1, flow, opener && page.placed.length > 0, page.placed, page.fragments, sequence))
      opener = opener && page.placed.length === 0
      index = page.index
      pending = page.pending
    }
    return pending
  }

  function flushNotes(
    continued: PaginatePageNote[],
    flow: PaginateFlow,
    part: 'front' | 'body',
    sequence: PaginateNumberSystem,
    pages: PaginateBookPage[],
  ): void {
    let pending = continued
    while (pending.length > 0) {
      const held = takeContinued(pending)
      if (held.fragments.length === 0) return
      pages.push(contentPage(part, pages.length + 1, flow, false, [], held.fragments, sequence))
      pending = held.leftover
    }
  }

  function paginatePart(flows: PaginateFlow[], part: 'front' | 'body'): PaginateBookResult {
    const sequence = part === 'front' ? input.settings.sequences.frontMatter : input.settings.sequences.body
    const pages: PaginateBookPage[] = []
    let continued: PaginatePageNote[] = []
    for (const flow of flows) {
      if (part === 'body' && input.settings.rectoOpenings && pages.length % 2 === 1) pages.push(blankPage(pages.length + 1))
      const result = paginateFlow(flow, part, sequence, pages, continued)
      if (!Array.isArray(result)) return { pages, refusals: [result] }
      continued = result
    }
    const last = flows[flows.length - 1]
    if (last) flushNotes(continued, last, part, sequence, pages)
    if (part === 'front' && input.settings.rectoOpenings && pages.length % 2 === 1) pages.push(blankPage(pages.length + 1))
    return { pages, refusals: [] }
  }

  const body = paginatePart(
    input.flows.filter((flow) => flow.kind === 'chapter' || flow.kind === 'endnotes'),
    'body',
  )
  if (body.refusals.length > 0) return body
  const front = paginatePart(
    input.flows.filter((flow) => flow.kind === 'front' || flow.kind === 'contents'),
    'front',
  )
  if (front.refusals.length > 0) return { pages: [...front.pages, ...body.pages], refusals: front.refusals }
  return { pages: [...front.pages, ...body.pages], refusals: [] }
}
