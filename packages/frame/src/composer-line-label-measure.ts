interface MeasuredLineNoteBlock {
  position: { block: number }
}

interface MeasuredLineNoteAnchor {
  id: string
  top: number
  block: number
}

/** Measures the start of each line-keyed lemma, or the note anchor when no lemma is present. */
export function measureLineNoteAnchors(
  flow: Element,
  blocks: readonly MeasuredLineNoteBlock[],
  blockElements: readonly Element[],
  origin: number,
): MeasuredLineNoteAnchor[] {
  const result: MeasuredLineNoteAnchor[] = []
  const anchors = flow.querySelectorAll('[data-segnavia-line-note-anchor]')
  for (const anchor of anchors) {
    const id = anchor.getAttribute('data-segnavia-line-note-anchor')
    if (!id) continue
    let container = anchor
    while (container.parentElement && container.parentElement !== flow) container = container.parentElement
    const elementIndex = blockElements.indexOf(container)
    const block = blocks[elementIndex]
    if (!block) continue
    result.push({ id, top: anchor.getBoundingClientRect().top - origin, block: block.position.block })
  }
  return result
}
