export const DIAGRAM_SELECTOR = '[data-segnavia-diagram="mermaid"]'

export function hasDiagram(html: string): boolean {
  return /<pre\b[^>]*\bdata-segnavia-diagram\s*=\s*(["'])mermaid\1/i.test(html)
}

export function withDiagramScript(html: string, nonce: string, script: string | undefined): string {
  if (!script || !hasDiagram(html)) return html
  const tag = `<script nonce="${nonce}">${script}</script>`
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${tag}</body>`) : `${html}${tag}`
}

export async function loadDiagramScript(html: string): Promise<string | undefined> {
  if (!hasDiagram(html)) return undefined
  return (await import('./diagrams.ts')).diagramScript
}
