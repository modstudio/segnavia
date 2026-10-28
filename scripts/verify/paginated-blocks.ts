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

  function noteFlowOk(held: ReturnType<typeof pages>, flow: string) {
    const chapter = flow.replace('segnavia-endnotes-', 'segnavia-chapter-')
    const notePages = held.filter((page) => page.flow === flow)
    const chapterPages = held.filter((page) => page.flow === chapter && page.role !== 'blank')
    const lastChapter = Math.max(0, ...chapterPages.map((page) => page.number))
    const firstNote = Math.min(...notePages.map((page) => page.number))
    const lastNote = Math.max(...notePages.map((page) => page.number))
    const next = held.find((page) => page.number > lastNote && page.flow !== flow)
    const ok = lastChapter < firstNote && notePages.every((page) => page.role !== 'blank')
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

  function table() {
    const galley = document.querySelector('[data-segnavia-galley-source] table')
    if (!galley) return { ok: false, detail: 'no galley table' }
    const expected = Array.from(galley.querySelectorAll('tbody tr')).map((row) => textOf(row))
    const header = Array.from(galley.querySelectorAll('thead tr'))
      .map((row) => textOf(row))
      .join(' ')
    const shown = Array.from(document.querySelectorAll('[data-segnavia-window]')).flatMap((view) => rowsInView(view))
    const repeats = Array.from(document.querySelectorAll('[data-segnavia-table-header]')).map((clone) => textOf(clone))
    const sequence = shown.join('|') === expected.join('|')
    const continued = repeats.length > 0 && header !== '' && repeats.every((text) => text.includes(header))
    return {
      ok: sequence && continued && expected.length > 0,
      detail: `rows ${shown.length}/${expected.length} repeats ${repeats.length} header ${JSON.stringify(header)}`,
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
