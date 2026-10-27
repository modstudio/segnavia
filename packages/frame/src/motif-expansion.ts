import { type FontReference, type MotifSource, type Page, printProperties, type SlotsOptions } from '@segnavia/format'
import { type ExpandedMotifs, expandMotifs } from '@segnavia/html'
import { frameDocument } from './bridge.ts'
import { type FontsOptions, pageFontCss } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal, slotHtml } from './slot-render.ts'

export type { FontsOptions } from './page-fonts.ts'
export { expandedPagesFontCss, FontRefusedError, pageFontCss, resolveFontReferences, resolvePageFonts, uniqueFontReferences } from './page-fonts.ts'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export interface ExpandedFramePage {
  page: Page
  fonts: FontReference[]
}

export async function expandFramePage(page: Page, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedFramePage> {
  if (!motifs) return { page, fonts: [] }
  const result = await expandMotifs(page.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang: page.lang,
    scripts: page.scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
  })
  signal.throwIfAborted()
  motifs.placed?.({ placed: result.placed, fonts: result.fonts, unavailable: result.unavailable })
  return { page: { ...page, html: result.html }, fonts: result.fonts }
}

export function expandFramePages(pages: Page[], motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedFramePage[]> {
  return Promise.all(pages.map((page) => expandFramePage(page, motifs, signal)))
}

export async function prepareShownPage(
  page: Page,
  motifs: MotifsOptions | undefined,
  slots: SlotsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ page: Page; resolved?: PreparedSlots; css: string }> {
  const expanded = await expandFramePage(page, motifs, signal)
  const refusal = slotFillRefusal(expanded.page.scripts, expanded.page.slots, slots)
  if (refusal) throw refusal
  const resolved = hasSlotWork(expanded.page.slots, slots) ? await prepareSlots(expanded.page.slots, slots, signal) : undefined
  const css = await pageFontCss(expanded.page, expanded.fonts, fonts, signal)
  return { page: expanded.page, resolved, css }
}

export function shownPageDocument(page: Page, resolved: PreparedSlots | undefined, options: { nonce: string; css?: string; csp?: string }): string {
  return frameDocument(slotHtml(page.html, resolved), {
    scripts: page.scripts,
    nonce: options.nonce,
    dir: page.dir,
    lang: page.lang,
    css: `${page.print ? printProperties(page.print) : ''}${options.css ?? ''}`,
    csp: options.csp,
    relayKeys: false,
  })
}
