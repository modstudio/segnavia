import { fingerprintValue, type Measurements, type PlanPage, type Plan as SavedPlan } from '@segnavia/format'
import type { BookPlanNumbering } from './book-plan-folios.ts'
import type { BookPlan } from './plan-book.ts'

export type ReplayPlanResult = { ok: true; plan: BookPlan } | { ok: false; page: number; refusal: string }

function withoutLineBoxes(measurements: Measurements) {
  return {
    ...measurements,
    flows: measurements.flows.map((flow) => (flow.kind === 'fixed' ? flow : { ...flow, blocks: flow.blocks.map(({ lines: _lines, ...block }) => block) })),
    notes: measurements.notes.map(({ lines: _lines, ...note }) => note),
  }
}

function breaksOf(measurements: Measurements): string[] {
  return measurements.flows.flatMap((flow) =>
    flow.kind === 'fixed' ? [] : flow.blocks.flatMap((block) => (block.breakBefore && block.id !== undefined ? [block.id] : [])),
  )
}

function inputFingerprint(measurements: Measurements, numbering: BookPlanNumbering): string {
  return fingerprintValue({ measurements: withoutLineBoxes(measurements), numbering })
}

function flowingFlow(measurements: Measurements, id: string) {
  const flow = measurements.flows.find((candidate) => candidate.id === id)
  return flow?.kind === 'fixed' ? undefined : flow
}

function startOf(measurements: Measurements, page: Pick<PlanPage, 'windows'>): PlanPage['start'] {
  const first = page.windows[0]
  if (!first) return undefined
  const flow = flowingFlow(measurements, first.flow)
  if (!flow) return undefined
  for (const [blockIndex, block] of flow.blocks.entries()) {
    const line = block.lines.findIndex((candidate) => candidate.top >= first.start)
    if (line >= 0 && block.lines[line]?.bottom !== undefined && (block.lines[line]?.bottom ?? Number.POSITIVE_INFINITY) <= first.end) {
      return { flow: flow.id, block: blockIndex, line, ...(block.id === undefined ? {} : { id: block.id }) }
    }
  }
  return undefined
}

function consumedLines(measurements: Measurements, page: Pick<PlanPage, 'windows'>) {
  return page.windows.map((window) => {
    const flow = flowingFlow(measurements, window.flow)
    return {
      flow: window.flow,
      lines:
        flow?.blocks.flatMap((block, blockIndex) =>
          block.lines.flatMap((line, lineIndex) =>
            line.top >= window.start && line.bottom <= window.end ? [{ block: blockIndex, line: lineIndex, box: line }] : [],
          ),
        ) ?? [],
    }
  })
}

function consumedNotes(measurements: Measurements, page: Pick<PlanPage, 'notes'>) {
  return page.notes.map((fragment) => {
    const note = measurements.notes.find((candidate) => candidate.id === fragment.id)
    return { id: fragment.id, series: fragment.series, start: fragment.start, end: fragment.end, lines: note?.lines.slice(fragment.start, fragment.end) ?? [] }
  })
}

function flowRemainders(measurements: Measurements, pages: Pick<PlanPage, 'windows'>[], pageIndex: number) {
  return measurements.flows.flatMap((flow) => {
    if (flow.kind === 'fixed') return []
    const last = pages.reduce((found, page, index) => (page.windows.some((window) => window.flow === flow.id) ? index : found), -1)
    if (last !== pageIndex) return []
    const lines = flow.blocks.flatMap((block, blockIndex) =>
      block.lines.flatMap((line, lineIndex) =>
        pages.every((page) => page.windows.every((window) => window.flow !== flow.id || line.top < window.start || line.bottom > window.end))
          ? [{ block: blockIndex, line: lineIndex, box: line }]
          : [],
      ),
    )
    return [{ flow: flow.id, lines }]
  })
}

function noteRemainders(measurements: Measurements, pages: Pick<PlanPage, 'notes'>[], pageIndex: number) {
  return measurements.notes.flatMap((note) => {
    const last = pages.reduce((found, page, index) => (page.notes.some((fragment) => fragment.id === note.id) ? index : found), -1)
    if (last !== pageIndex) return []
    const lines = note.lines.flatMap((line, lineIndex) =>
      pages.every((page) => page.notes.every((fragment) => fragment.id !== note.id || lineIndex < fragment.start || lineIndex >= fragment.end))
        ? [{ line: lineIndex, box: line }]
        : [],
    )
    return [{ id: note.id, lines }]
  })
}

function pageFingerprint(
  measurements: Measurements,
  page: Pick<PlanPage, 'role' | 'blank' | 'windows' | 'notes'>,
  pages: Pick<PlanPage, 'windows' | 'notes'>[],
  pageIndex: number,
): string {
  return fingerprintValue({
    role: page.role,
    blank: page.blank,
    lines: consumedLines(measurements, page),
    notes: consumedNotes(measurements, page),
    remainder: {
      flows: flowRemainders(measurements, pages, pageIndex),
      notes: noteRemainders(measurements, pages, pageIndex),
    },
  })
}

function savedPage(measurements: Measurements, pages: BookPlan['pages'], page: BookPlan['pages'][number], pageIndex: number): PlanPage {
  const start = startOf(measurements, page)
  return { ...page, ...(start === undefined ? {} : { start }), fingerprint: pageFingerprint(measurements, page, pages, pageIndex) }
}

export function savePlan(measurements: Measurements, plan: BookPlan, numbering: BookPlanNumbering): SavedPlan {
  return {
    version: 1,
    fingerprint: inputFingerprint(measurements, numbering),
    breaks: breaksOf(measurements),
    pages: plan.pages.map((page, pageIndex) => savedPage(measurements, plan.pages, page, pageIndex)),
    folios: plan.folios,
    total: plan.total,
  }
}

function blockName(measurements: Measurements, start: NonNullable<PlanPage['start']>): string {
  const flow = flowingFlow(measurements, start.flow)
  return flow?.blocks[start.block]?.id ?? `${start.flow} block ${start.block}`
}

function pageRefusal(page: number, block: string): ReplayPlanResult {
  return {
    ok: false,
    page,
    refusal: `page ${page} no longer matches the plan: block ${block} laid out differently; compute a new plan to clear this refusal`,
  }
}

function fieldRefusal(page: number, path: string, problem: string): ReplayPlanResult {
  return {
    ok: false,
    page,
    refusal: `pages.${page - 1}.${path} ${problem}; compute a new plan to clear this refusal`,
  }
}

function noteRefusal(page: number, id: string): ReplayPlanResult {
  return {
    ok: false,
    page,
    refusal: `page ${page} no longer matches the plan: note ${id} laid out differently; compute a new plan to clear this refusal`,
  }
}

function validateStart(measurements: Measurements, page: PlanPage, pageNumber: number): ReplayPlanResult | undefined {
  const first = page.windows[0]
  if (!first) return page.start === undefined ? undefined : fieldRefusal(pageNumber, 'start', 'must be absent when the page has no flowing window')
  const flow = measurements.flows.find((candidate) => candidate.id === page.start?.flow)
  if (!page.start) return fieldRefusal(pageNumber, 'start', 'could not establish the page beginning')
  if (!flow || flow.kind === 'fixed') return fieldRefusal(pageNumber, 'start.flow', `names missing or non-flowing flow ${JSON.stringify(page.start.flow)}`)
  const block = flow.blocks[page.start.block]
  if (!block) return fieldRefusal(pageNumber, 'start.block', `is outside flow ${JSON.stringify(flow.id)}`)
  if (!block.lines[page.start.line])
    return fieldRefusal(pageNumber, 'start.line', `is outside block ${JSON.stringify(block.id ?? `${flow.id}:${page.start.block}`)}`)
  if (page.start.id !== block.id)
    return fieldRefusal(pageNumber, 'start.id', `does not match block ${JSON.stringify(block.id ?? `${flow.id}:${page.start.block}`)}`)
  const actual = startOf(measurements, page)
  if (!actual || actual.flow !== page.start.flow || actual.block !== page.start.block || actual.line !== page.start.line || actual.id !== page.start.id) {
    return pageRefusal(pageNumber, blockName(measurements, page.start))
  }
}

function validateWindows(measurements: Measurements, page: PlanPage, pageNumber: number): ReplayPlanResult | undefined {
  for (const [index, window] of page.windows.entries()) {
    const flow = flowingFlow(measurements, window.flow)
    if (!flow) return fieldRefusal(pageNumber, `windows.${index}.flow`, `names missing or non-flowing flow ${JSON.stringify(window.flow)}`)
    if (consumedLines(measurements, { windows: [window] })[0]?.lines.length === 0) {
      return fieldRefusal(pageNumber, `windows.${index}`, `is outside flow ${JSON.stringify(window.flow)} line boxes`)
    }
  }
}

function validateNotes(measurements: Measurements, page: PlanPage, pageNumber: number): ReplayPlanResult | undefined {
  for (const [index, fragment] of page.notes.entries()) {
    const note = measurements.notes.find((candidate) => candidate.id === fragment.id)
    if (!note || fragment.start > fragment.end || fragment.end > note.lines.length) {
      return fieldRefusal(pageNumber, `notes.${index}`, `is outside note ${JSON.stringify(fragment.id)} line boxes`)
    }
  }
}

function fingerprintRefusal(measurements: Measurements, saved: SavedPlan, page: PlanPage, pageNumber: number, pageIndex: number): ReplayPlanResult {
  const note = noteRemainders(measurements, saved.pages, pageIndex).find((remainder) => remainder.lines.length > 0)
  if (note) return noteRefusal(pageNumber, note.id)
  const remainder = flowRemainders(measurements, saved.pages, pageIndex).flatMap((flow) =>
    flow.lines.map((line) => ({ flow: flow.flow, block: line.block })),
  )[0]
  const flow = remainder && flowingFlow(measurements, remainder.flow)
  const name =
    flow?.blocks[remainder?.block ?? -1]?.id ??
    (remainder ? `${remainder.flow} block ${remainder.block}` : page.start ? blockName(measurements, page.start) : page.flow)
  return pageRefusal(pageNumber, name)
}

export function replayPlan(measurements: Measurements, saved: SavedPlan, numbering: BookPlanNumbering): ReplayPlanResult {
  if (saved.fingerprint !== inputFingerprint(measurements, numbering) || fingerprintValue(saved.breaks) !== fingerprintValue(breaksOf(measurements))) {
    return {
      ok: false,
      page: 1,
      refusal: "the plan's inputs changed (settings, geometry, breaks or block order); compute a new plan to clear this refusal",
    }
  }
  for (const [index, page] of saved.pages.entries()) {
    const pageNumber = index + 1
    const invalid =
      validateStart(measurements, page, pageNumber) ?? validateWindows(measurements, page, pageNumber) ?? validateNotes(measurements, page, pageNumber)
    if (invalid) return invalid
    if (page.fingerprint !== pageFingerprint(measurements, page, saved.pages, index)) {
      return fingerprintRefusal(measurements, saved, page, pageNumber, index)
    }
  }
  return { ok: true, plan: { pages: saved.pages, folios: saved.folios, total: saved.total } }
}

export function savedPlanScript(): string {
  const functions = [
    withoutLineBoxes,
    breaksOf,
    inputFingerprint,
    flowingFlow,
    startOf,
    consumedLines,
    consumedNotes,
    pageFingerprint,
    savedPage,
    savePlan,
    blockName,
    pageRefusal,
    fieldRefusal,
    noteRefusal,
    flowRemainders,
    noteRemainders,
    validateStart,
    validateWindows,
    validateNotes,
    fingerprintRefusal,
    replayPlan,
  ]
  return `${functions.map((fn) => fn.toString()).join('\n')}
var savePlan=${savePlan.name};
var replayPlan=${replayPlan.name};`
}
