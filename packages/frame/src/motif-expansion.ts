import { type FontReference, type MotifSource, type Page, printProperties, type SlotsOptions } from '@segnavia/format'
import { type ExpandedMotifs, expandMotifs, MotifRefusedError } from '@segnavia/html'
import { frameDocument } from './bridge.ts'
import { type FontsOptions, pageFontCss } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal, slotHtml } from './slot-render.ts'

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
  const parentHtml = page.printedPages?.parents.flatMap((parent) => [parent.head, parent.foot]).filter((html): html is string => html !== undefined) ?? []
  if (!motifs) {
    if (parentHtml.some((html) => /\bdata-motif\s*=/.test(html))) {
      throw new MotifRefusedError('A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.')
    }
    return { page, fonts: [] }
  }
  const result = await expandMotifs(page.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang: page.lang,
    scripts: page.scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
  })
  const parentResults = await Promise.all(
    parentHtml.map((html) =>
      expandMotifs(html, {
        source: motifs.source,
        pins: motifs.pins,
        lang: page.lang,
        scripts: page.scripts,
        prefix: 'slot',
        linkOrigins: motifs.linkOrigins,
        signal,
        deferPaths: ['printedPage'],
      }),
    ),
  )
  signal.throwIfAborted()
  const summaries = [result, ...parentResults]
  const summary = {
    placed: summaries.flatMap((item) => item.placed),
    fonts: summaries.flatMap((item) => item.fonts),
    unavailable: [...new Set(summaries.flatMap((item) => item.unavailable))],
  }
  motifs.placed?.(summary)
  let parentIndex = 0
  const printedPages = page.printedPages
    ? {
        ...page.printedPages,
        parents: page.printedPages.parents.map((parent) => ({
          ...parent,
          ...(parent.head === undefined ? {} : { head: parentResults[parentIndex++]?.html ?? parent.head }),
          ...(parent.foot === undefined ? {} : { foot: parentResults[parentIndex++]?.html ?? parent.foot }),
        })),
      }
    : undefined
  return { page: { ...page, html: result.html, ...(printedPages ? { printedPages } : {}) }, fonts: summary.fonts }
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
