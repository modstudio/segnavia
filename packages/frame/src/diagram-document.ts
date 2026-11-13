import { registerLayoutProvider } from './layout.ts'

export const DIAGRAM_SELECTOR = 'pre[data-segnavia-diagram="mermaid"]'
export const DIAGRAM_FAILED_ATTRIBUTE = 'data-segnavia-diagram-failed'
export const DIAGRAM_ERROR_ATTRIBUTE = 'data-segnavia-diagram-error'
export const DIAGRAM_ID_PREFIX = 'segnavia-diagram-'

export type DiagramProvider = () => Promise<string>

export function registerDiagramProvider(provider: DiagramProvider): void {
  registerLayoutProvider('diagram', { script: provider, selects: DIAGRAM_SELECTOR })
}

const selector = /^([a-z]+)\[([a-z-]+)="([^"]+)"\]$/.exec(DIAGRAM_SELECTOR)
if (!selector) throw new Error('The diagram selector must be an element with one exact attribute value.')
const [, diagramTag, diagramAttribute, diagramValue] = selector
const DIAGRAM_PATTERN = new RegExp(`<${diagramTag}\\b[^>]*\\b${diagramAttribute}\\s*=\\s*(["'])${diagramValue}\\1`, 'i')

export function hasDiagram(html: string): boolean {
  return DIAGRAM_PATTERN.test(html)
}

