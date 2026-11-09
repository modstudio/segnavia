// The press sheets an imposed print document lays out: one section per paper
// side, each placement clipped to its bleed box.

import type { Imposed, impose, pagePlacementLayout } from '@segnavia/format'

export const mm = (value: number) => `${value}mm`

export interface PrintablePaperBody {
  body: string
  side: 'front' | 'back'
}

export function imposedPaperDocument(paper: Imposed['paper'], rootAttributes: string, bodies: readonly PrintablePaperBody[], extraHead = ''): string {
  const papers = bodies.map(({ body, side }) => `<section class="paper" data-side="${side}">${body}</section>`).join('')
  return `<!doctype html><html${rootAttributes}><head><meta charset="utf-8">${extraHead}<style>@page{size:${mm(paper.width)} ${mm(paper.height)};margin:0}html,body{margin:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.paper{width:${mm(paper.width)};height:${mm(paper.height)};position:relative;overflow:hidden;break-after:page}</style></head><body>${papers}</body></html>`
}

export function imposedPaperBodies(imposed: Imposed, placementBody: (paper: number, side: 'front' | 'back') => string): PrintablePaperBody[] {
  return Array.from({ length: imposed.papers }, (_, paper) =>
    (['front', 'back'] as const).slice(0, imposed.sides).map((side) => ({ body: placementBody(paper, side), side })),
  ).flat()
}

export function placementBox(
  inner: (dimensions: string) => string,
  placement: ReturnType<typeof impose>['placements'][number],
  layout: ReturnType<typeof pagePlacementLayout>,
  scale: number,
): string {
  const position = `left:${mm(layout.paper.x - placement.bleedBox.x)};top:${mm(layout.paper.y - placement.bleedBox.y)}`
  const dimensions =
    layout.kind === 'fluid'
      ? 'width:100%;height:100%'
      : `width:${layout.piece.width}px;height:${layout.piece.height}px;${position};transform:scale(${scale});transform-origin:0 0`
  return `<div class="placement" style="position:absolute;left:${mm(placement.bleedBox.x)};top:${mm(placement.bleedBox.y)};width:${mm(placement.bleedBox.width)};height:${mm(placement.bleedBox.height)};overflow:hidden">${inner(dimensions)}</div>`
}
