export interface PaginatedReport {
  failure: string | null
  pages: number
  lost: number
  repeated: number
  notes: { id: string; ok: boolean }[]
  columns: { balanced: boolean; lost: number; repeated: number }
  furniture: { blanksHaveNone: boolean; openersHaveNoHead: boolean; bodyHasFolio: boolean }
  contents: { matches: boolean; detail: string }
  clip: { midpoint: boolean; inkAtEdge: boolean }
  runningHead: { fromMark: boolean; carried: boolean; detail: string }
  direction: string | null
}

export function inspectPaginatedBook(): PaginatedReport {
  function originTop(element: Element) {
    return element.getBoundingClientRect().top
  }

  function lineBoxes(element: Element, origin: number) {
    const range = document.createRange()
    range.selectNodeContents(element)
    const groups: Array<{ top: number; bottom: number }> = []
    for (const rect of Array.from(range.getClientRects())) {
      const top = rect.top - origin
      const bottom = rect.bottom - origin
      const found = groups.find((group) => Math.abs(group.top - top) < 0.5)
      if (!found) groups.push({ top, bottom })
      else if (bottom > found.bottom) found.bottom = bottom
    }
    return groups.sort((left, right) => left.top - right.top)
  }

  function windowHits(flowId: string, mid: number, columnsOnly: boolean) {
    return Array.from(document.querySelectorAll('[data-segnavia-window]')).filter((view) => {
      if (view.getAttribute('data-flow') !== flowId) return false
      if (columnsOnly && Number(view.getAttribute('data-columns')) < 2) return false
      return mid >= Number(view.getAttribute('data-start')) && mid < Number(view.getAttribute('data-end'))
    })
  }

  function tallyHits(id: string, mid: number, columnsOnly: boolean, lost: { n: number }, repeated: { n: number }) {
    const hits = windowHits(id, mid, columnsOnly)
    if (hits.length === 0) lost.n += 1
    if (hits.length > 1) repeated.n += 1
  }

  function coverage() {
    const lost = { n: 0 }
    const repeated = { n: 0 }
    for (const flow of Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-flow]'))) {
      const id = flow.getAttribute('data-segnavia-flow') ?? ''
      const origin = originTop(flow)
      for (const child of Array.from(flow.children)) {
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
        for (const line of lineBoxes(child, origin)) tallyHits(id, (line.top + line.bottom) / 2, false, lost, repeated)
      }
    }
    return { lost: lost.n, repeated: repeated.n }
  }

  function notes() {
    const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
    return Array.from(document.querySelectorAll('[data-segnavia-book-page] a[id^="segnavia-fnref-"]')).map((ref) => {
      const href = ref.getAttribute('href') ?? ''
      const note = href.startsWith('#') ? href.slice(1) : ''
      const page = ref.closest('[data-segnavia-book-page]')
      const index = Number(page?.getAttribute('data-segnavia-book-page'))
      const later = pages.some(
        (candidate) => Number(candidate.getAttribute('data-segnavia-book-page')) >= index && candidate.querySelector(`[data-segnavia-page-note="${note}"]`),
      )
      return { id: note, ok: Boolean(page?.querySelector(`[data-segnavia-page-note="${note}"]`)) || later }
    })
  }

  function columnGroups() {
    const groups = new Map<string, Element[]>()
    for (const view of Array.from(document.querySelectorAll('[data-segnavia-window]'))) {
      if (Number(view.getAttribute('data-columns')) < 2) continue
      const key = `${view.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page')}:${view.getAttribute('data-top')}:${view.getAttribute('data-flow')}`
      groups.set(key, [...(groups.get(key) ?? []), view])
    }
    return groups
  }

  function visibleLines(view: Element) {
    const clone = view.firstElementChild
    if (!clone) return 0
    const height = view.getBoundingClientRect().height
    return lineBoxes(clone, originTop(view)).filter((line) => line.bottom > 0.5 && line.top < height - 0.5).length
  }

  function columnsBalanced() {
    let balanced = true
    for (const group of columnGroups().values()) {
      const counts = group.map((view) => ({ column: Number(view.getAttribute('data-column')), count: visibleLines(view) }))
      const max = Math.max(...counts.map((item) => item.count))
      const min = Math.min(...counts.map((item) => item.count))
      if (max - min > 1) balanced = false
      const first = counts.find((item) => item.column === 0)
      const second = counts.find((item) => item.column === 1)
      if (first && second && first.count < second.count) balanced = false
    }
    return balanced
  }

  function columnCoverage() {
    const lost = { n: 0 }
    const repeated = { n: 0 }
    for (const block of Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-columns]'))) {
      const flowEl = block.closest('[data-segnavia-flow]')
      const id = flowEl?.getAttribute('data-segnavia-flow') ?? ''
      const origin = flowEl ? originTop(flowEl) : 0
      for (const line of lineBoxes(block, origin)) tallyHits(id, (line.top + line.bottom) / 2, true, lost, repeated)
    }
    return { lost: lost.n, repeated: repeated.n }
  }

  function columns() {
    return { balanced: columnsBalanced(), ...columnCoverage() }
  }

  function furniture() {
    const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
    const role = (page: Element, name: string) => page.getAttribute('data-segnavia-role') === name
    return {
      blanksHaveNone: pages.filter((page) => role(page, 'blank')).every((page) => !page.querySelector('.segnavia-running-head, .segnavia-folio')),
      openersHaveNoHead: pages.filter((page) => role(page, 'opener')).every((page) => !page.querySelector('.segnavia-running-head')),
      bodyHasFolio: pages.filter((page) => role(page, 'body')).every((page) => Boolean(page.querySelector('.segnavia-folio')?.textContent?.trim())),
    }
  }

  function contents() {
    const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
    const opener = (id: string) =>
      pages
        .find((page) => page.getAttribute('data-segnavia-flow') === id && page.getAttribute('data-segnavia-role') === 'opener')
        ?.querySelector('.segnavia-folio')?.textContent ?? ''
    const entries = Array.from(document.querySelectorAll('.segnavia-contents-page[data-target]')).map((node) => ({
      id: node.getAttribute('data-target') ?? '',
      text: node.textContent?.trim() ?? '',
    }))
    return {
      matches: entries.filter((entry) => entry.id.startsWith('segnavia-chapter-')).every((entry) => entry.text === opener(entry.id) && entry.text !== ''),
      detail: entries.map((entry) => `${entry.id}:${entry.text}:${opener(entry.id)}`).join('|'),
    }
  }

  function flowLines(flowId: string) {
    const flow = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-flow="${flowId}"]`)
    if (!flow) return []
    const origin = originTop(flow)
    const lines: Array<{ top: number; bottom: number }> = []
    for (const child of Array.from(flow.children)) {
      if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
      lines.push(...lineBoxes(child, origin))
    }
    return lines.sort((left, right) => left.top - right.top)
  }

  function clip() {
    let midpoint = true
    let inkAtEdge = true
    for (const view of Array.from(document.querySelectorAll('[data-segnavia-window]'))) {
      const start = Number(view.getAttribute('data-start'))
      const lines = flowLines(view.getAttribute('data-flow') ?? '')
      const onBottom = lines.some((line) => Math.abs(line.bottom - start) < 0.5)
      const onTop = lines.some((line) => Math.abs(line.top - start) < 0.5)
      const between = lines.some((line, index) => line.bottom < start - 0.25 && lines[index + 1] !== undefined && (lines[index + 1]?.top ?? 0) > start + 0.25)
      if (onBottom && !onTop && !between) midpoint = false
      if (between || onTop) inkAtEdge = inkAtEdge && start >= 0
    }
    return { midpoint, inkAtEdge }
  }

  function runningHead() {
    const heads = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
      .filter((page) => page.getAttribute('data-segnavia-role') === 'body')
      .map((page) => page.querySelector('.segnavia-running-head')?.textContent?.trim() ?? '')
    const marked = heads.filter((head) => head.includes('Mark') || head.includes('סימן'))
    return {
      fromMark: marked.length > 0,
      carried: marked.length >= 2,
      detail: heads.join('|'),
    }
  }

  const counted = coverage()
  return {
    failure: document.documentElement.getAttribute('data-segnavia-compose-failure'),
    pages: document.querySelectorAll('[data-segnavia-book-page]').length,
    lost: counted.lost,
    repeated: counted.repeated,
    notes: notes(),
    columns: columns(),
    furniture: furniture(),
    contents: contents(),
    clip: clip(),
    runningHead: runningHead(),
    direction: document.documentElement.getAttribute('dir'),
  }
}
