import type { MeasuredLineBox } from './composer-measure.ts'

interface MeasuredSideNoteBlock {
  kind: string
  lines: readonly MeasuredLineBox[]
}

interface MeasuredSideNote {
  id: string
  kind: 'block' | 'inline'
  top: number
  direction: 'ltr' | 'rtl'
}

export function sideNoteKind(note: { parentElement: Element | null }, flow: Element): 'block' | 'inline' {
  return note.parentElement === flow ? 'block' : 'inline'
}

export function inlineSideNoteAnchorTop(staticTop: number, containingLines: readonly MeasuredLineBox[]): number {
  return containingLines.find((line) => staticTop >= line.top - 0.5 && staticTop < line.bottom + 0.5)?.top ?? staticTop
}

export function sideNoteAnchorTop(
  kind: 'block' | 'inline',
  staticTop: number,
  containingLines: readonly MeasuredLineBox[],
  followingBlocks: readonly MeasuredSideNoteBlock[],
): number {
  if (kind === 'block') {
    const block = followingBlocks[0]
    const line = block?.lines.find((candidate) => candidate.counted !== false) ?? block?.lines[0]
    if (line) return line.top
    return staticTop
  }
  return inlineSideNoteAnchorTop(staticTop, containingLines)
}

/** Measures side-note anchors and records the computed direction of each anchor block. */
export function measureSideNotes(
  flow: Element,
  blocks: readonly MeasuredSideNoteBlock[],
  blockElements: readonly Element[],
  origin: number,
): MeasuredSideNote[] {
  const result: MeasuredSideNote[] = []
  const notes = flow.querySelectorAll('[data-side-note]')
  for (const note of notes) {
    const id = note.getAttribute('data-segnavia-id')
    if (!id) continue
    const kind = sideNoteKind(note, flow)
    const noteTop = note.getBoundingClientRect().top - origin
    let container = note
    while (container.parentElement && container.parentElement !== flow) container = container.parentElement
    const containerIndex = blockElements.indexOf(container)
    const containing = containerIndex < 0 ? [] : (blocks[containerIndex]?.lines ?? [])
    let following: readonly MeasuredSideNoteBlock[] = []
    let anchor: Element = containerIndex < 0 ? flow : (blockElements[containerIndex] ?? flow)
    if (kind === 'block') {
      const noteChildIndex = Array.prototype.indexOf.call(flow.children, note) as number
      const followingIndex = blockElements.findIndex((element) => Array.prototype.indexOf.call(flow.children, element) > noteChildIndex)
      if (followingIndex >= 0) {
        following = blocks.slice(followingIndex)
        anchor = blockElements[followingIndex] ?? flow
      } else anchor = flow
    }
    const computedDirection = getComputedStyle(anchor).direction
    result.push({
      id,
      kind,
      top: sideNoteAnchorTop(kind, noteTop, containing, following),
      direction: computedDirection === 'rtl' ? 'rtl' : 'ltr',
    })
  }
  return result
}
