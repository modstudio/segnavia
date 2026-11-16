import { logicalExtent } from './composer-axis-policy.ts'
import { measurementStyleKey, type ParagraphToken } from './composer-paragraph-measure.ts'

interface ParagraphFitSettings {
  measure: number
  indent?: number
  spacing: { desired: number }
}

export function hyphenWidth(paragraph: Element, doc: Document, styleFor: typeof getComputedStyle, widths: Map<string, number>): number {
  const style = styleFor(paragraph)
  const key = `${style.writingMode}|${measurementStyleKey(paragraph, styleFor)}`
  const cached = widths.get(key)
  if (cached !== undefined) return cached
  const marker = doc.createElement('span')
  marker.textContent = '-'
  marker.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
  paragraph.append(marker)
  const rect = marker.getBoundingClientRect()
  marker.remove()
  const width = logicalExtent(rect, style.writingMode, 'inline')
  widths.set(key, width)
  return width
}

export function paragraphFitsOneLine(tokens: readonly ParagraphToken[], settings: ParagraphFitSettings): boolean {
  if (tokens.length === 0 || tokens.some((token) => token.kind === 'forced')) return false
  const desired = settings.spacing.desired / 100
  const width = tokens.reduce((sum, token) => sum + token.width * (token.kind === 'space' ? desired : 1), 0)
  return width <= settings.measure - (settings.indent ?? 0)
}

export function structuredParagraphReuseKey(paragraph: Element, facts: readonly unknown[], tokens: readonly ParagraphToken[]): string {
  return JSON.stringify([paragraph.innerHTML, ...facts, tokens.map((token) => token.width)])
}
