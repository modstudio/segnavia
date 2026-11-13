import { htmlElementAttributes } from '@segnavia/html'
import { parseSelection, selectionMatches } from './layout-selection.ts'

export interface LayoutMarker {
  readonly name: string
  readonly selects: string
  readonly remedy: string
}

export const DIAGRAM_LAYOUT_MARKER = {
  name: 'diagram',
  selects: 'pre[data-segnavia-diagram="mermaid"]',
  remedy: "Call registerDiagramProvider(diagrams) from '@segnavia/frame/diagrams', or import '@segnavia/diagrams/auto'",
} as const satisfies LayoutMarker

export const LIBRARY_LAYOUT_MARKERS: readonly LayoutMarker[] = [DIAGRAM_LAYOUT_MARKER]

const PARSED_LAYOUT_MARKERS = LIBRARY_LAYOUT_MARKERS.map((marker) => {
  const selection = parseSelection(marker.selects)
  if (!selection) throw new Error(`Library layout marker ${JSON.stringify(marker.name)} has an invalid selection.`)
  return { marker, selection }
})

export function matchingLayoutMarkers(html: string): readonly LayoutMarker[] {
  const elements = htmlElementAttributes(html)
  return PARSED_LAYOUT_MARKERS.filter(({ selection }) => elements.some((element) => selectionMatches(selection, element))).map(({ marker }) => marker)
}
