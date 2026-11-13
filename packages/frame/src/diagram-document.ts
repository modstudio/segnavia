import { htmlElementAttributes } from '@segnavia/html'
import { registerLayoutProvider } from './layout.ts'
import { DIAGRAM_LAYOUT_MARKER, matchingLayoutMarkers } from './layout-markers.ts'

export const DIAGRAM_SELECTOR = DIAGRAM_LAYOUT_MARKER.selects
export const DIAGRAM_PROVIDER_NAME = DIAGRAM_LAYOUT_MARKER.name
export const DIAGRAM_FAILED_ATTRIBUTE = 'data-segnavia-diagram-failed'
export const DIAGRAM_ERROR_ATTRIBUTE = 'data-segnavia-diagram-error'
export const DIAGRAM_ID_PREFIX = 'segnavia-diagram-'

export type DiagramProvider = () => Promise<string>

export function registerDiagramProvider(provider: DiagramProvider): void {
  registerLayoutProvider(DIAGRAM_PROVIDER_NAME, { script: provider, selects: DIAGRAM_SELECTOR })
}

export function hasDiagram(html: string): boolean {
  return matchingLayoutMarkers(htmlElementAttributes(html)).includes(DIAGRAM_LAYOUT_MARKER)
}
