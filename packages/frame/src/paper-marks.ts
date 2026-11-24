import {
  FOLD_DASH_OFF_MM,
  FOLD_DASH_ON_MM,
  type Imposition,
  impositionMarks,
  MARK_THICKNESS_PT,
  MM_PER_PT,
  type OmittedImpositionMark,
  type PiecePress,
} from '@segnavia/format'

export interface PaperMarkLine {
  x1: number
  y1: number
  x2: number
  y2: number
  strokeWidth: number
  dashArray?: readonly [number, number]
}

export interface PaperMarkLines {
  lines: PaperMarkLine[]
  omittedMarks: OmittedImpositionMark[]
}

/** Projects the PDF imposition-mark geometry into SVG line values in millimeters. */
export function paperMarkLines(imposition: Imposition, press: PiecePress, side: 'front' | 'back'): PaperMarkLines {
  const marks = impositionMarks(imposition, press)
  const shown = marks.find((entry) => entry.side === side)
  return {
    lines: (shown?.marks ?? []).map((mark) => ({
      ...mark,
      strokeWidth: MARK_THICKNESS_PT * MM_PER_PT,
      ...(mark.dashed ? { dashArray: [FOLD_DASH_ON_MM, FOLD_DASH_OFF_MM] as const } : {}),
    })),
    omittedMarks: marks.flatMap((entry) => entry.omittedMarks),
  }
}

export function appendPaperMarks(
  box: HTMLElement,
  imposition: Imposition,
  press: PiecePress,
  side: 'front' | 'back',
  paper: { width: number; height: number },
): void {
  const { lines } = paperMarkLines(imposition, press, side)
  if (lines.length === 0) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.classList.add('segnavia-paper__marks')
  svg.setAttribute('viewBox', `0 0 ${paper.width} ${paper.height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  for (const mark of lines) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    for (const name of ['x1', 'y1', 'x2', 'y2'] as const) line.setAttribute(name, String(mark[name]))
    line.setAttribute('stroke-width', String(mark.strokeWidth))
    if (mark.dashArray) line.setAttribute('stroke-dasharray', mark.dashArray.join(' '))
    svg.append(line)
  }
  box.append(svg)
}
