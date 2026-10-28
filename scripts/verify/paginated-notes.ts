import { unpointed } from './hebrew-text.ts'

export interface NoteViewGeometry {
  views: number
  outside: number
  empty: number
  detail: string
}

export function inspectNoteViewGeometry(): NoteViewGeometry {
  function containsRect(outer: DOMRect, inner: DOMRect, slack: number) {
    return inner.left >= outer.left - slack && inner.right <= outer.right + slack && inner.top >= outer.top - slack && inner.bottom <= outer.bottom + slack
  }

  function intersectsRect(outer: DOMRect, inner: DOMRect) {
    return inner.right > outer.left && inner.left < outer.right && inner.bottom > outer.top && inner.top < outer.bottom
  }

  function textInkRects(root: Element) {
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      if (node.textContent?.trim()) {
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width > 0 && rect.height > 0) rects.push(rect)
        }
      }
      node = walker.nextNode() as Text | null
    }
    return rects
  }

  function distinctTops(rects: DOMRect[]) {
    const tops: number[] = []
    for (const rect of rects) {
      if (!tops.some((top) => Math.abs(top - rect.top) < 0.5)) tops.push(rect.top)
    }
    return tops.length
  }

  const views = Array.from(document.querySelectorAll('[data-segnavia-page-note]'))
  let outside = 0
  let empty = 0
  const samples: string[] = []
  for (const view of views) {
    const box = view.getBoundingClientRect()
    const rects = textInkRects(view)
    const expected = Number(view.getAttribute('data-segnavia-note-lines'))
    const inside = rects.filter((rect) => containsRect(box, rect, 0.5))
    const spilled = rects.filter((rect) => intersectsRect(box, rect) && !containsRect(box, rect, 0.5))
    const lines = distinctTops(inside)
    if (rects.length === 0 || inside.length === 0) empty += 1
    if (!(expected >= 1) || spilled.length > 0 || lines !== expected) {
      outside += 1
      if (samples.length < 3) {
        samples.push(`${view.getAttribute('data-segnavia-page-note') ?? ''}:inside ${inside.length} lines ${lines} expected ${expected} spilled ${spilled.length}`)
      }
    }
  }
  return {
    views: views.length,
    outside,
    empty,
    detail: JSON.stringify({ views: views.length, outside, empty, samples }),
  }
}

export function pageContainsNoteText(pdfText: string, noteText: string): boolean {
  const expected = unpointed(noteText)
  return expected.length > 0 && unpointed(pdfText).includes(expected)
}
