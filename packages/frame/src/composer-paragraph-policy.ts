import type { readCompositionStyle } from '@segnavia/html'
import type { contentInlineSize } from './composer-paragraph-box.ts'

export interface ComposedParagraph {
  children: Node[]
  inlineSize: number
  contentSignature: string
}

export interface ParagraphCompositionFact {
  paragraph: Element
  previous: ComposedParagraph | undefined
  inlineSize: number
  style: CSSStyleDeclaration
  composition: ReturnType<typeof readCompositionStyle>
  composer: string
  contentChanged: boolean
}

export function paragraphCompositionAction(
  previousInlineSize: number | undefined,
  inlineSize: number,
  textAlign: string,
  composer: string,
  lineCount: number,
  contentChanged = false,
) {
  if (previousInlineSize !== undefined && !contentChanged && Math.abs(previousInlineSize - inlineSize) <= 0.5) return 'skip'
  const shouldCompose = textAlign === 'justify' && composer === 'paragraph' && lineCount > 1
  if (previousInlineSize !== undefined) return shouldCompose ? 'restore-and-compose' : 'restore'
  return shouldCompose ? 'compose' : 'leave'
}

export function firstStrongDirection(text: string): 'ltr' | 'rtl' | undefined {
  for (const character of text) {
    if (/^[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]$/u.test(character)) return 'rtl'
    if (/^\p{Letter}$/u.test(character)) return 'ltr'
  }
  return undefined
}

export function paragraphBaseDirection(ownDirection: string | null, unicodeBidi: string, text: string, computedDirection: string): 'ltr' | 'rtl' {
  const pageDirection = computedDirection === 'rtl' ? 'rtl' : 'ltr'
  const direction = ownDirection?.toLowerCase()
  if (direction === 'ltr' || direction === 'rtl') return direction
  if (direction === 'auto' || unicodeBidi === 'plaintext') return firstStrongDirection(text) ?? pageDirection
  return pageDirection
}

export function paragraphLanguage(paragraph: Element, doc: Document): string {
  return paragraph.closest('[lang]')?.getAttribute('lang') ?? doc.documentElement.lang
}

export function originalContentSignature(children: readonly Node[]): string {
  return children.map((node) => (node.nodeType === 1 ? (node as Element).outerHTML : (node.textContent ?? ''))).join('\u0000')
}

export function paragraphCompositionFacts(
  paragraphs: NodeListOf<Element>,
  styleFor: typeof getComputedStyle,
  composedParagraphs: WeakMap<Element, ComposedParagraph>,
  readStyle: typeof readCompositionStyle,
  measureContent: typeof contentInlineSize,
): ParagraphCompositionFact[] {
  const facts: ParagraphCompositionFact[] = []
  for (const paragraph of paragraphs) {
    const style = styleFor(paragraph)
    const inlineSize = measureContent(paragraph.getBoundingClientRect(), style)
    const previous = composedParagraphs.get(paragraph)
    const composition = style.textAlign === 'justify' ? readStyle(style) : {}
    const composer = composition.composer ?? 'paragraph'
    const contentChanged = previous !== undefined && originalContentSignature(previous.children) !== previous.contentSignature
    if (previous && !contentChanged && Math.abs(previous.inlineSize - inlineSize) <= 0.5) continue
    facts.push({ paragraph, previous, inlineSize, style, composition, composer, contentChanged })
  }
  return facts
}

export function restoreParagraph(
  paragraph: Element,
  previous: ComposedParagraph | undefined,
  composedParagraphs: WeakMap<Element, ComposedParagraph>,
  variableValueAttribute: string,
): void {
  if (!previous) return
  paragraph.replaceChildren(...previous.children)
  paragraph.removeAttribute(variableValueAttribute)
  composedParagraphs.delete(paragraph)
}
