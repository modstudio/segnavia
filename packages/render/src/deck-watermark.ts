import { type Deck, resolveDirection } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import type { PageFontFacts } from './overflow.ts'
import { pageFontFactsFromRoot } from './page-render.ts'
import { type WatermarkPageFacts, type WatermarkPart, watermarkPartFromFacts } from './watermark-stamp.ts'

export type DeckWatermark = (parts: readonly WatermarkPart[], pageCount?: number) => Promise<Uint8Array[]>

export interface RenderedDeckPage extends PageFontFacts {
  index: number
  bytes: Uint8Array
}

interface DeckFontCapture {
  prepare?: (tab: Tab) => Promise<void>
  textRootSelector?: string
}

export async function captureDeckFont(tab: Tab, enabled: boolean, capture: DeckFontCapture = {}): Promise<PageFontFacts> {
  await capture.prepare?.(tab)
  return enabled ? pageFontFactsFromRoot(tab, { textRootSelector: capture.textRootSelector }) : {}
}

function pageFacts(deck: Deck, font: PageFontFacts): WatermarkPageFacts {
  return {
    direction: resolveDirection(deck.dir, deck.lang, deck.title),
    ...(deck.lang ? { lang: deck.lang } : {}),
    ...(font.fontFamily ? { fontFamily: font.fontFamily } : {}),
    ...(font.fontFaceCss ? { fontFaceCss: font.fontFaceCss } : {}),
  }
}

function slideIsHtml(deck: Deck, index: number): boolean {
  const content = deck.slides[index]?.content
  return content !== undefined && 'kind' in content && content.kind === 'html'
}

export async function watermarkRegularDeck(
  watermark: DeckWatermark | undefined,
  bytes: Uint8Array,
  deck: Deck,
  pageOwners: readonly number[],
  printableFont: PageFontFacts,
  rendered: readonly RenderedDeckPage[],
): Promise<Uint8Array> {
  if (!watermark) return bytes
  const fonts = new Map(rendered.map((item) => [item.index, item]))
  const firstHtmlFont = rendered[0] ?? printableFont
  const owners = pageOwners.length > 0 ? pageOwners : deck.slides.map((_, index) => index)
  const pageFactsForOutput = owners.map((owner) => pageFacts(deck, pageOwners.length > 0 ? printableFont : (fonts.get(owner) ?? firstHtmlFont)))
  const [output] = await watermark([watermarkPartFromFacts(bytes, pageFactsForOutput)], owners.length)
  return output as Uint8Array
}

export async function watermarkImposedDeck(watermark: DeckWatermark | undefined, deck: Deck, rendered: readonly RenderedDeckPage[]): Promise<Uint8Array[]> {
  if (!watermark) return rendered.map((item) => item.bytes)
  const firstHtmlFont = rendered.find((item) => slideIsHtml(deck, item.index))
  return watermark(
    rendered.map((item) => {
      const font = slideIsHtml(deck, item.index) ? item : (firstHtmlFont ?? item)
      return watermarkPartFromFacts(item.bytes, [pageFacts(deck, font)], [item.index + 1])
    }),
    deck.slides.length,
  )
}
