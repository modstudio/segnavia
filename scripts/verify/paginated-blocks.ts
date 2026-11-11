export { PAGINATED_TABLE_FLOW_IDS } from '../demo-book-table-fixtures.ts'

export interface PaginatedBlockReport {
  endnotes: { ok: boolean; detail: string }
  image: { ok: boolean; detail: string }
  table: { ok: boolean; detail: string }
  wrappedTable: { ok: boolean; detail: string }
  marginTable: { ok: boolean; detail: string }
  direction: { ok: boolean; detail: string }
}

// `void` matches Playwright's no-argument PageFunction overload used by the IDML verifier.
// biome-ignore lint/suspicious/noConfusingVoidType: the callback accepts that overload as well as optional flow ids
export function inspectPaginatedBlocks(flowIds: { table?: string; wrapped?: string; margin?: string } | void): PaginatedBlockReport {
  function originTop(element: Element) {
    return element.getBoundingClientRect().top
  }

  function textOf(node: Element) {
    return (node.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  function pages() {
    return Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) => ({
      node: page,
      flow: page.getAttribute('data-segnavia-flow') ?? '',
      role: page.getAttribute('data-segnavia-role') ?? '',
      number: Number(page.getAttribute('data-segnavia-book-page')),
    }))
  }

  function nextAfterNotesOk(next: ReturnType<typeof pages>[number] | undefined, chapter: string, chapterFlows: ReadonlySet<string>) {
    if (!next) return true
    if (next.flow === chapter) return false
    if (next.role === 'blank' || next.role === 'opener' || next.role === 'fixed') return true
    return next.role === 'body' && !chapterFlows.has(next.flow)
  }

  function noteFlowOk(held: ReturnType<typeof pages>, flow: string, chapter: string, chapterFlows: ReadonlySet<string>) {
    const notePages = held.filter((page) => page.flow === flow)
    const chapterPages = held.filter((page) => page.flow === chapter && page.role !== 'blank')
    const lastChapter = Math.max(0, ...chapterPages.map((page) => page.number))
    const firstNote = Math.min(...notePages.map((page) => page.number))
    const lastNote = Math.max(...notePages.map((page) => page.number))
    const afterChapter = held.find((page) => page.number === lastChapter + 1)
    const next = held.find((page) => page.number === lastNote + 1)
    const otherChapter = held.some((page) => page.number >= firstNote && page.number <= lastNote && page.flow !== flow && page.role !== 'blank')
    const ok = afterChapter?.flow === flow && !otherChapter && nextAfterNotesOk(next, chapter, chapterFlows) && notePages.every((page) => page.role !== 'blank')
    return { ok, detail: `${flow}:${lastChapter}->${firstNote}-${lastNote}:${next ? `${next.role}:${next.flow}` : 'end'}` }
  }

  function endnotes() {
    const held = pages()
    const sources = Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-flow]')).map(
      (node) => node.getAttribute('data-segnavia-flow') ?? '',
    )
    const chapterFlows = new Set(sources.filter((flow) => !flow.startsWith('segnavia-endnotes-')))
    const flows = [...new Set(held.filter((page) => page.flow.startsWith('segnavia-endnotes-')).map((page) => page.flow))]
    if (flows.length === 0) return { ok: false, detail: 'no chapter endnotes' }
    const reports = flows.map((flow) => {
      const index = sources.indexOf(flow)
      return noteFlowOk(held, flow, sources[index - 1] ?? '', chapterFlows)
    })
    return { ok: reports.every((report) => report.ok), detail: reports.map((report) => report.detail).join('|') }
  }

  function image() {
    const area = document.querySelector('[data-segnavia-text]')
    const textHeight = area?.getBoundingClientRect().height ?? 0
    const images = Array.from(document.querySelectorAll('[data-segnavia-window] img:not([data-keep-probes] img)'))
    if (images.length === 0 || textHeight <= 0) return { ok: false, detail: `images ${images.length} text ${textHeight}` }
    const papers = new Set(images.map((img) => img.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page') ?? ''))
    papers.delete('')
    const tallest = Math.max(0, ...images.map((img) => img.getBoundingClientRect().height))
    return {
      ok: papers.size === 1 && tallest <= textHeight + 1,
      detail: `pages ${[...papers].join(',')} height ${tallest.toFixed(1)}/${textHeight.toFixed(1)}`,
    }
  }

  function rowsInView(view: Element, source: Element) {
    const start = Number(view.getAttribute('data-start'))
    const end = Number(view.getAttribute('data-end'))
    const flowId = view.getAttribute('data-flow') ?? ''
    const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
    if (!flow?.contains(source)) return []
    const origin = originTop(flow)
    return Array.from(source.querySelectorAll('tbody tr')).flatMap((row) => {
      const box = row.getBoundingClientRect()
      const mid = (box.top + box.bottom) / 2 - origin
      return mid >= start && mid < end ? [textOf(row)] : []
    })
  }

  function headerClipOk(clone: Element) {
    const clip = clone.getBoundingClientRect()
    const head = clone.querySelector('thead')
    const row = clone.querySelector('tbody tr')
    if (!head || !row) return false
    const headBox = head.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    const startsAtClip = Math.abs(headBox.top - clip.top) <= 1
    return startsAtClip && (rowBox.top + rowBox.bottom) / 2 >= clip.bottom - 0.5
  }

  function cloneMatchesWindow(clone: Element, win: Element) {
    if (clone.closest('[data-segnavia-book-page]') !== win.closest('[data-segnavia-book-page]')) return false
    const clip = clone.getBoundingClientRect()
    const box = win.getBoundingClientRect()
    return Math.abs(clip.bottom - box.top) <= 1.5 && Math.abs(clip.left - box.left) <= 1.5 && Math.abs(clip.right - box.right) <= 1.5
  }

  function table(requestedFlowId?: string) {
    const selector = requestedFlowId ? `[data-segnavia-flow="${requestedFlowId}"] table` : 'table'
    const galley = document.querySelector(`[data-segnavia-galley-source] ${selector}`)
    const flow = galley?.closest('[data-segnavia-flow]')
    if (!galley || !flow) return { ok: false, detail: 'no galley table' }
    const origin = originTop(flow)
    const tableBox = galley.getBoundingClientRect()
    const tableBottom = tableBox.bottom - origin
    const head = galley.querySelector('thead')
    const headBottom = head ? head.getBoundingClientRect().bottom - origin : tableBox.top - origin
    const flowId = flow.getAttribute('data-segnavia-flow') ?? ''
    const expected = Array.from(galley.querySelectorAll('tbody tr')).map((row) => textOf(row))
    const shown = Array.from(document.querySelectorAll('[data-segnavia-window]')).flatMap((view) => rowsInView(view, galley))
    const sequence = shown.join('|') === expected.join('|')
    const continuations = Array.from(document.querySelectorAll('[data-segnavia-window]')).filter((win) => {
      if (win.getAttribute('data-flow') !== flowId) return false
      const start = Number(win.getAttribute('data-start'))
      return start > headBottom && start < tableBottom
    })
    const headerText = textOf(galley.querySelector('thead') ?? galley)
    const clones = Array.from(document.querySelectorAll('[data-segnavia-table-header]')).filter(
      (clone) => textOf(clone.querySelector('thead') ?? clone) === headerText,
    )
    const clipOk = clones.length > 0 && clones.every((clone) => headerClipOk(clone))
    const onlyOnContinuation = clones.every((clone) => continuations.some((win) => cloneMatchesWindow(clone, win)))
    const everyContinuation = continuations.every((win) => clones.some((clone) => cloneMatchesWindow(clone, win)))
    const tableClones = clones.every((clone) => clone.firstElementChild?.tagName === 'TABLE')
    return {
      ok: sequence && expected.length > 0 && continuations.length > 0 && clipOk && onlyOnContinuation && everyContinuation && tableClones,
      detail: `rows ${shown.length}/${expected.length} repeats ${clones.length}/${continuations.length} clip ${clipOk} tables ${tableClones}`,
    }
  }

  function direction() {
    const root = document.documentElement.getAttribute('dir')
    if (root !== 'rtl') return { ok: true, detail: root ?? 'ltr' }
    const table = document.querySelector('[data-segnavia-book-page] table')
    const notes = document.querySelector('[data-segnavia-book-page][data-segnavia-flow^="segnavia-endnotes-"]')
    const tableDir = table ? getComputedStyle(table).direction : ''
    const notesDir = notes ? getComputedStyle(notes).direction : ''
    return { ok: tableDir === 'rtl' && notesDir === 'rtl', detail: `table ${tableDir} notes ${notesDir}` }
  }

  return {
    endnotes: endnotes(),
    image: image(),
    table: table(flowIds?.table),
    wrappedTable: flowIds?.wrapped ? table(flowIds.wrapped) : { ok: true, detail: 'not requested' },
    marginTable: flowIds?.margin ? table(flowIds.margin) : { ok: true, detail: 'not requested' },
    direction: direction(),
  }
}
