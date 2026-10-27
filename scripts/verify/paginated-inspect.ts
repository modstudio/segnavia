export interface PaginatedDesignedReport {
  spreadVerso: boolean
  spreadFaces: boolean
  spreadHasNoFurniture: boolean
  leafHasFurniture: boolean
  contents: { matches: boolean; detail: string }
}

export interface PaginatedReport {
  failure: string | null
  pages: number
  lost: number
  repeated: number
  notes: { id: string; ok: boolean }[]
  columns: { balanced: boolean; lost: number; repeated: number }
  furniture: { blanksHaveNone: boolean; openersHaveNoHead: boolean; bodyHasFolio: boolean }
  contents: { matches: boolean; detail: string }
  clip: { midpoint: boolean }
  blocks: { extra: number; missing: number; shown: number }
  lines: { shifted: number; checked: number }
  runningHead: { fromMark: boolean; carried: boolean; detail: string }
  direction: string | null
  ids: { unique: boolean; count: number; duplicates: string[] }
  spine: { page: number; distance: number; side: string }[]
  designed: PaginatedDesignedReport
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
      if (flow.getAttribute('data-segnavia-kind') === 'fixed') continue
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
    for (const view of Array.from(document.querySelectorAll('[data-segnavia-window]'))) {
      const start = Number(view.getAttribute('data-start'))
      const lines = flowLines(view.getAttribute('data-flow') ?? '')
      const onBottom = lines.some((line) => Math.abs(line.bottom - start) < 0.5)
      const onTop = lines.some((line) => Math.abs(line.top - start) < 0.5)
      const between = lines.some((line, index) => line.bottom < start - 0.25 && lines[index + 1] !== undefined && (lines[index + 1]?.top ?? 0) > start + 0.25)
      if (onBottom && !onTop && !between) midpoint = false
    }
    return { midpoint }
  }

  function blockExtent(element: Element, origin: number) {
    const lines = lineBoxes(element, origin)
    if (!lines.length) {
      const box = element.getBoundingClientRect()
      return { top: box.top - origin, bottom: box.bottom - origin }
    }
    return { top: lines[0]?.top ?? 0, bottom: lines[lines.length - 1]?.bottom ?? 0 }
  }

  function tallyBlock(view: Element, extent: { top: number; bottom: number }, index: number, counts: { extra: number; missing: number; shown: number }) {
    const start = Number(view.getAttribute('data-start'))
    const end = Number(view.getAttribute('data-end'))
    const intersects = extent.bottom > start && extent.top < end
    const present = Boolean(view.querySelector(`[data-segnavia-block="${index}"]`))
    if (present) counts.shown += 1
    if (intersects === present) return
    if (intersects) counts.missing += 1
    else counts.extra += 1
  }

  function blocks() {
    const counts = { extra: 0, missing: 0, shown: 0 }
    for (const flow of Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-flow]'))) {
      if (flow.getAttribute('data-segnavia-kind') === 'fixed') continue
      const id = flow.getAttribute('data-segnavia-flow') ?? ''
      const origin = originTop(flow)
      const windows = Array.from(document.querySelectorAll(`[data-segnavia-window][data-flow="${id}"]`))
      for (const [index, child] of Array.from(flow.children).entries()) {
        if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue
        const extent = blockExtent(child, origin)
        for (const view of windows) tallyBlock(view, extent, index, counts)
      }
    }
    return counts
  }

  function placedLines(view: Element) {
    const clone = view.firstElementChild
    if (!clone) return []
    const origin = originTop(view)
    const placed: Array<{ top: number; bottom: number }> = []
    for (const child of Array.from(clone.children)) {
      if (child.hasAttribute('data-segnavia-window-spacer')) continue
      placed.push(...lineBoxes(child, origin))
    }
    return placed
  }

  function lineShift() {
    let shifted = 0
    let checked = 0
    for (const view of Array.from(document.querySelectorAll('[data-segnavia-window]'))) {
      const start = Number(view.getAttribute('data-start'))
      const end = Number(view.getAttribute('data-end'))
      const placed = placedLines(view)
      if (!placed.length && !view.firstElementChild) continue
      for (const line of flowLines(view.getAttribute('data-flow') ?? '')) {
        const mid = (line.top + line.bottom) / 2
        if (mid < start || mid >= end) continue
        checked += 1
        if (!placed.some((held) => Math.abs(held.top - (line.top - start)) < 0.5)) shifted += 1
      }
    }
    return { shifted, checked }
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

  function uniqueIds() {
    const ids = Array.from(document.querySelectorAll('[id]'))
      .map((node) => node.id)
      .filter(Boolean)
    const counts = new Map<string, number>()
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    const duplicates = [...counts].filter(([, count]) => count > 1).map(([id]) => id)
    return { unique: duplicates.length === 0 && ids.length > 0, count: ids.length, duplicates }
  }

  function spine() {
    const direction = document.documentElement.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr'
    return Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) => {
      const index = Number(page.getAttribute('data-segnavia-book-page'))
      const text = page.querySelector('[data-segnavia-text]')
      if (!text) return { page: index, distance: Number.NaN, side: 'missing' }
      const paperBox = page.getBoundingClientRect()
      const textBox = text.getBoundingClientRect()
      const rightHand = (index % 2 === 1) === (direction === 'ltr')
      return {
        page: index,
        distance: rightHand ? textBox.left - paperBox.left : paperBox.right - textBox.right,
        side: rightHand ? 'right' : 'left',
      }
    })
  }

  function designedPages(id: string) {
    return Array.from(document.querySelectorAll(`[data-segnavia-book-page][data-segnavia-flow="${id}"][data-segnavia-role="fixed"]`))
  }

  function hasFurniture(page: Element) {
    return Boolean(page.querySelector('.segnavia-running-head, .segnavia-folio, [data-segnavia-parent="ornament-foot"]'))
  }

  function designedContents() {
    const designedEntries = Array.from(document.querySelectorAll('.segnavia-contents-page[data-target]')).flatMap((node) => {
      const id = node.getAttribute('data-target') ?? ''
      const target = document.getElementById(id)
      const paper = target?.closest('[data-segnavia-book-page]')
      if (paper?.getAttribute('data-segnavia-role') !== 'fixed' && !id.startsWith('segnavia-designed-')) return []
      const folio =
        (id.startsWith('segnavia-designed-') ? designedPages(id)[0]?.getAttribute('data-segnavia-folio') : paper?.getAttribute('data-segnavia-folio')) ?? ''
      const text = node.textContent?.trim() ?? ''
      return [{ id, text, folio }]
    })
    return {
      matches: designedEntries.length > 0 && designedEntries.every((entry) => entry.text === entry.folio && entry.text !== ''),
      detail: designedEntries.map((entry) => `${entry.id}:${entry.text}:${entry.folio}`).join('|'),
    }
  }

  function designed(): PaginatedDesignedReport {
    const spread = designedPages('segnavia-designed-1')
    const leaf = designedPages('segnavia-designed-2')
    const first = spread[0]
    const second = spread[1]
    const firstIndex = Number(first?.getAttribute('data-segnavia-book-page'))
    const secondIndex = Number(second?.getAttribute('data-segnavia-book-page'))
    return {
      spreadVerso: firstIndex % 2 === 0,
      spreadFaces: Boolean(first && second && secondIndex === firstIndex + 1 && secondIndex % 2 === 1),
      spreadHasNoFurniture: spread.length === 2 && spread.every((page) => !hasFurniture(page)),
      leafHasFurniture:
        leaf.length === 1 && leaf.every((page) => Boolean(page.querySelector('[data-segnavia-parent="ornament-foot"] .segnavia-folio')?.textContent?.trim())),
      contents: designedContents(),
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
    blocks: blocks(),
    lines: lineShift(),
    runningHead: runningHead(),
    direction: document.documentElement.getAttribute('dir'),
    ids: uniqueIds(),
    spine: spine(),
    designed: designed(),
  }
}
