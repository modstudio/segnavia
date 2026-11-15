import type { ParagraphLine, ParagraphToken } from './composer-paragraph.ts'

export const COMPOSITION_IDENTITY_ATTRIBUTE = 'data-segnavia-composition-identity'
export const COMPOSITION_CONTINUATION_ATTRIBUTE = 'data-segnavia-composition-continuation'
export const COMPOSITION_VARIABLE_VALUE_ATTRIBUTE = 'data-segnavia-composition-variable-value'

export function setRangeStart(range: Range, token: ParagraphToken): void {
  if (token.node?.nodeType === 3 && token.start !== undefined) range.setStart(token.node, token.start)
  else if (token.node) range.setStartBefore(token.node)
}

export function setRangeEnd(range: Range, token: ParagraphToken): void {
  if (token.node?.nodeType === 3 && token.end !== undefined) range.setEnd(token.node, token.end)
  else if (token.node) range.setEndAfter(token.node)
}

export function lineFragment(tokens: readonly ParagraphToken[], line: ParagraphLine, doc: Document): DocumentFragment {
  const first = tokens[line.start]
  const last = tokens[line.end - 1]
  const fragment = doc.createDocumentFragment()
  if (!first?.node || !last?.node) return fragment
  const range = doc.createRange()
  setRangeStart(range, first)
  setRangeEnd(range, last)
  fragment.append(range.cloneContents())
  return fragment
}

export function markCompositionIdentities(paragraph: Element, identityAttribute: string, variableValueAttribute: string): () => void {
  const elements = paragraph.querySelectorAll('[data-variable],.segnavia-note-ref > a,[data-segnavia-line-note]')
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index]
    element?.setAttribute(identityAttribute, String(index))
    if (element?.hasAttribute('data-variable')) element.setAttribute(variableValueAttribute, element.textContent ?? '')
  }
  return () => {
    for (const element of elements) {
      element.removeAttribute(identityAttribute)
      element.removeAttribute(variableValueAttribute)
    }
  }
}

export function markCompositionContinuations(fragments: readonly ParentNode[], identityAttribute: string, continuationAttribute: string): void {
  const seen = new Set<string>()
  for (const fragment of fragments) {
    for (const element of fragment.querySelectorAll(`[${identityAttribute}]`)) {
      const identity = element.getAttribute(identityAttribute) ?? ''
      element.removeAttribute(identityAttribute)
      if (seen.has(identity)) element.setAttribute(continuationAttribute, '')
      else seen.add(identity)
    }
  }
}

export function removeContinuationIds(fragments: readonly ParentNode[]): void {
  const seen = new Set<string>()
  for (const fragment of fragments) {
    for (const element of fragment.querySelectorAll('[id]')) {
      const id = element.getAttribute('id') ?? ''
      if (seen.has(id)) element.removeAttribute('id')
      else seen.add(id)
    }
  }
}

export function rewriteParagraph(
  paragraph: Element,
  tokens: readonly ParagraphToken[],
  lines: readonly ParagraphLine[],
  doc: Document,
  direction: string,
  identityAttribute: string,
  continuationAttribute: string,
  variableValueAttribute: string,
): void {
  const clearIdentities = markCompositionIdentities(paragraph, identityAttribute, variableValueAttribute)
  const fragments = lines.map((line) => lineFragment(tokens, line, doc))
  clearIdentities()
  removeContinuationIds(fragments)
  markCompositionContinuations(fragments, identityAttribute, continuationAttribute)
  const output = lines.map((line, index) => {
    const span = doc.createElement('span')
    span.setAttribute('data-segnavia-line', '')
    span.dir = direction
    span.style.display = 'block'
    span.style.textAlign = index === lines.length - 1 || line.forced ? 'start' : 'justify'
    if (index > 0) span.style.textIndent = '0'
    if (index < lines.length - 1 && !line.forced) span.style.wordSpacing = `${line.wordSpacing}px`
    span.append(fragments[index] as DocumentFragment)
    if (line.hyphen) {
      const marker = doc.createElement('span')
      marker.setAttribute('data-segnavia-hyphen', '')
      marker.setAttribute('aria-hidden', 'true')
      marker.textContent = '-'
      span.append(marker)
    }
    return span
  })
  paragraph.replaceChildren(...output)
}
