import type { Imposition, impose, PiecePress } from '@segnavia/format'
import { fitPaper } from './paper-fit.ts'
import { paperBoxSize } from './paper-geometry.ts'
import { appendPaperMarks } from './paper-marks.ts'

type PaperBoxContent = (box: HTMLElement) => void

export function paintPaperBox(
  host: HTMLElement,
  imposition: Imposition,
  imposed: ReturnType<typeof impose>,
  press: PiecePress,
  side: 'front' | 'back',
  content: PaperBoxContent,
): void {
  const box = document.createElement('div')
  box.className = 'segnavia-paper__paper'
  // Positions on paper are physical and therefore left to right. The box
  // writes no text; each page keeps its own direction inside its frame.
  box.dir = 'ltr'
  const paper = paperBoxSize(imposed.paper)
  box.style.width = `${paper.width}px`
  box.style.height = `${paper.height}px`
  content(box)
  appendPaperMarks(box, imposition, press, side, imposed.paper)
  host.style.setProperty('--segnavia-paper-aspect', `${imposed.paper.width} / ${imposed.paper.height}`)
  host.replaceChildren(box)
  fitPaper(host, imposed)
}

export function paintPaperPlaceholder(
  host: HTMLElement,
  imposition: Imposition,
  imposed: ReturnType<typeof impose>,
  press: PiecePress,
  side: 'front' | 'back',
): void {
  paintPaperBox(host, imposition, imposed, press, side, () => {})
}
