export function insideSideNote(element: Element | null): boolean {
  return element !== null && element.closest('[data-side-note]') !== null
}

export function contentRangesExcludingSideNotes(element: Element): Range[] {
  const notes = Array.from(element.querySelectorAll('[data-side-note]'))
  if (notes.length === 0) {
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    return [range]
  }
  const ranges: Range[] = []
  let range = element.ownerDocument.createRange()
  range.setStart(element, 0)
  for (const note of notes) {
    range.setEndBefore(note)
    ranges.push(range)
    range = element.ownerDocument.createRange()
    range.setStartAfter(note)
  }
  range.setEnd(element, element.childNodes.length)
  ranges.push(range)
  return ranges
}
