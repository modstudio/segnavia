import type { readCompositionStyle } from '@segnavia/html'
import { firstStrongDirection } from '@segnavia/format'
import type { contentInlineSize } from './composer-paragraph-box.ts'

export interface ComposedParagraph {
  children: Node[]
  inlineSize: number
}

export function compositionDefaults() {
  return { composer: 'paragraph', hyphenate: true, wordSpacing: { minimum: 80, desired: 100, maximum: 133 } } as const
}

export interface ParagraphCompositionFact {
  paragraph: Element
  previous: ComposedParagraph | undefined
  inlineSize: number
  style: CSSStyleDeclaration
  composition: ReturnType<typeof readCompositionStyle>
  composer: string
}

export function composesParagraph(textAlign: string, composer: string): boolean {
  return textAlign === 'justify' && composer === compositionDefaults().composer
}

export function paragraphCompositionUnchanged(previousInlineSize: number | undefined, inlineSize: number): boolean {
  return previousInlineSize !== undefined && Math.abs(previousInlineSize - inlineSize) <= 0.5
}

export function paragraphCompositionAction(
  previousInlineSize: number | undefined,
  inlineSize: number,
  textAlign: string,
  composer: string,
  lineCount: number,
) {
  if (paragraphCompositionUnchanged(previousInlineSize, inlineSize)) return 'skip'
  const shouldCompose = composesParagraph(textAlign, composer) && lineCount > 1
  if (previousInlineSize !== undefined) return shouldCompose ? 'restore-and-compose' : 'restore'
  return shouldCompose ? 'compose' : 'leave'
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
    const composer = composition.composer ?? compositionDefaults().composer
    facts.push({ paragraph, previous, inlineSize, style, composition, composer })
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
