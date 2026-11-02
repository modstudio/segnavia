export const DIAGRAM_SELECTOR = 'pre[data-segnavia-diagram="mermaid"]'
export const DIAGRAM_FAILED_ATTRIBUTE = 'data-segnavia-diagram-failed'
export const DIAGRAM_ERROR_ATTRIBUTE = 'data-segnavia-diagram-error'
export const DIAGRAM_ID_PREFIX = 'segnavia-diagram-'
export const DIAGRAM_READY_NAME = '__segnaviaDiagramReady'
export const DIAGRAM_READY_EXPR = `window.${DIAGRAM_READY_NAME}||null`

const selector = /^([a-z]+)\[([a-z-]+)="([^"]+)"\]$/.exec(DIAGRAM_SELECTOR)
if (!selector) throw new Error('The diagram selector must be an element with one exact attribute value.')
const [, diagramTag, diagramAttribute, diagramValue] = selector
const DIAGRAM_PATTERN = new RegExp(`<${diagramTag}\\b[^>]*\\b${diagramAttribute}\\s*=\\s*(["'])${diagramValue}\\1`, 'i')

export function hasDiagram(html: string): boolean {
  return DIAGRAM_PATTERN.test(html)
}

export function withDiagramScript(html: string, nonce: string, script: string | undefined): string {
  if (!script || !hasDiagram(html)) return html
  const tag = `<script nonce="${nonce}">${script}</script>`
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, () => `${tag}</body>`) : `${html}${tag}`
}

export async function loadDiagramScript(html: string): Promise<string | undefined> {
  if (!hasDiagram(html)) return undefined
  return (await import('./diagrams.ts')).diagramScript
}

export async function loadDiagramScriptResult(html: string): Promise<{ script?: string; error?: unknown }> {
  try {
    return { script: await loadDiagramScript(html) }
  } catch (error) {
    return { error }
  }
}
