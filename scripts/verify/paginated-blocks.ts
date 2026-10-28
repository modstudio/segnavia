export interface PaginatedBlockReport {
  endnotes: { ok: boolean; detail: string }
  image: { ok: boolean; detail: string }
  table: { ok: boolean; detail: string }
  direction: { ok: boolean; detail: string }
}

export function inspectPaginatedBlocks(): PaginatedBlockReport {
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

  function nextAfterNotesOk(next: ReturnType<typeof pages>[number] | undefined, chapter: string) {
    if (!next) return true
    if (next.flow === chapter) return false
    if (next.role === 'blank' || next.role === 'opener' || next.role === 'fixed') return true
    return next.role === 'body' && !/^segnavia-chapter-\d+$/.test(next.flow)
  }

  function noteFlowOk(held: ReturnType<typeof pages>, flow: string) {
    const chapter = flow.replace('segnavia-endnotes-', 'segnavia-chapter-')
    const notePages = held.filter((page) => page.flow === flow)
    const chapterPages = held.filter((page) => page.flow === chapter && page.role !== 'blank')
    const lastChapter = Math.max(0, ...chapterPages.map((page) => page.number))
    const firstNote = Math.min(...notePages.map((page) => page.number))
    const lastNote = Math.max(...notePages.map((page) => page.number))
    const afterChapter = held.find((page) => page.number === lastChapter + 1)
    const next = held.find((page) => page.number === lastNote + 1)
    const otherChapter = held.some(
      (page) => page.number >= firstNote && page.number <= lastNote && page.flow !== flow && /^segnavia-chapter-\d+$/.test(page.flow),
    )
    const ok = afterChapter?.flow === flow && !otherChapter && nextAfterNotesOk(next, chapter) && notePages.every((page) => page.role !== 'blank')
    return { ok, detail: `${flow}:${lastChapter}->${firstNote}-${lastNote}:${next ? `${next.role}:${next.flow}` : 'end'}` }
  }

  function endnotes() {
    const held = pages()
    const flows = [...new Set(held.filter((page) => /^segnavia-endnotes-\d+$/.test(page.flow)).map((page) => page.flow))]
    if (flows.length === 0) return { ok: false, detail: 'no chapter endnotes' }
    const reports = flows.map((flow) => noteFlowOk(held, flow))
    return { ok: reports.every((report) => report.ok), detail: reports.map((report) => report.detail).join('|') }
  }

  function image() {
    const area = document.querySelector('[data-segnavia-text]')
    const textHeight = area?.getBoundingClientRect().height ?? 0
    const images = Array.from(document.querySelectorAll('[data-segnavia-window] img'))
    if (images.length === 0 || textHeight <= 0) return { ok: false, detail: `images ${images.length} text ${textHeight}` }
    const papers = new Set(images.map((img) => img.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page') ?? ''))
    papers.delete('')
    const tallest = Math.max(0, ...images.map((img) => img.getBoundingClientRect().height))
    return {
      ok: papers.size === 1 && tallest <= textHeight + 1,
      detail: `pages ${[...papers].join(',')} height ${tallest.toFixed(1)}/${textHeight.toFixed(1)}`,
    }
  }

  function rowsInView(view: Element) {
    const start = Number(view.getAttribute('data-start'))
    const end = Number(view.getAttribute('data-end'))
    const flowId = view.getAttribute('data-flow') ?? ''
    const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
    const source = flow?.querySelector('table')
    if (!flow || !source) return []
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
    const intersects = headBox.bottom > clip.top + 0.5 && headBox.top < clip.bottom - 0.5
    return intersects && (rowBox.top + rowBox.bottom) / 2 >= clip.bottom - 0.5
  }

  function cloneMatchesWindow(clone: Element, win: Element) {
    if (clone.closest('[data-segnavia-book-page]') !== win.closest('[data-segnavia-book-page]')) return false
    const clip = clone.getBoundingClientRect()
    const box = win.getBoundingClientRect()
    return Math.abs(clip.bottom - box.top) <= 1.5 && Math.abs(clip.left - box.left) <= 1.5 && Math.abs(clip.right - box.right) <= 1.5
  }

  function table() {
    const galley = document.querySelector('[data-segnavia-galley-source] table')
    const flow = galley?.closest('[data-segnavia-flow]')
    if (!galley || !flow) return { ok: false, detail: 'no galley table' }
    const origin = originTop(flow)
    const tableBox = galley.getBoundingClientRect()
    const tableTop = tableBox.top - origin
    const tableBottom = tableBox.bottom - origin
    const expected = Array.from(galley.querySelectorAll('tbody tr')).map((row) => textOf(row))
    const shown = Array.from(document.querySelectorAll('[data-segnavia-window]')).flatMap((view) => rowsInView(view))
    const sequence = shown.join('|') === expected.join('|')
    const continuations = Array.from(document.querySelectorAll('[data-segnavia-window]')).filter((win) => {
      const start = Number(win.getAttribute('data-start'))
      return start > tableTop && start < tableBottom
    })
    const clones = Array.from(document.querySelectorAll('[data-segnavia-table-header]'))
    const clipOk = clones.length > 0 && clones.every((clone) => headerClipOk(clone))
    const onlyOnContinuation = clones.every((clone) => continuations.some((win) => cloneMatchesWindow(clone, win)))
    const everyContinuation = continuations.every((win) => clones.some((clone) => cloneMatchesWindow(clone, win)))
    return {
      ok: sequence && expected.length > 0 && continuations.length > 0 && clipOk && onlyOnContinuation && everyContinuation,
      detail: `rows ${shown.length}/${expected.length} repeats ${clones.length}/${continuations.length} clip ${clipOk}`,
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

  return { endnotes: endnotes(), image: image(), table: table(), direction: direction() }
}
