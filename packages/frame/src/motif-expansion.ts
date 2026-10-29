import { type FontReference, type MotifSource, type Page, PRINTED_PAGE_CONTEXT, printProperties, type SlotsOptions } from '@segnavia/format'
import { documentLanguage, type ExpandedMotifs, expandMotifs, hasMotifPlacement, libraryMotifPlacementRefusal, MotifRefusedError } from '@segnavia/html'
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

function parentRegions(page: Page): Array<{ name: string; region: 'head' | 'foot'; html: string }> {
  return (
    page.printedPages?.parents.flatMap((parent) =>
      (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
    ) ?? []
  )
}

export function framePageMotifRefusal(page: Page): MotifRefusedError | undefined {
  const regions = parentRegions(page)
  for (const html of [page.html, ...regions.map(({ html }) => html)]) {
    const refusal = libraryMotifPlacementRefusal(html)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (regions.some(({ html }) => hasMotifPlacement(html))) {
    return new MotifRefusedError('A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.')
  }
  return undefined
}

export async function expandFramePage(page: Page, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedFramePage> {
  const regions = parentRegions(page)
  if (!motifs) {
    const refusal = framePageMotifRefusal(page)
    if (refusal) throw refusal
    return { page, fonts: [] }
  }
  const lang = page.lang?.trim() || documentLanguage(page.html)
  const result = await expandMotifs(page.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang,
    scripts: page.scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
  })
  const parentResults = new Map(
    await Promise.all(
      regions.map(
        async ({ name, region, html }) =>
          [
            `${name}:${region}`,
            await expandMotifs(html, {
              source: motifs.source,
              pins: motifs.pins,
              lang,
              scripts: page.scripts,
              prefix: 'slot',
              linkOrigins: motifs.linkOrigins,
              signal,
              deferPaths: [PRINTED_PAGE_CONTEXT],
            }),
          ] as const,
      ),
    ),
  )
  signal.throwIfAborted()
  const summaries = [result, ...parentResults.values()]
  const summary = {
    placed: summaries.flatMap((item) => item.placed),
    fonts: summaries.flatMap((item) => item.fonts),
    unavailable: [...new Set(summaries.flatMap((item) => item.unavailable))],
  }
  motifs.placed?.(summary)
  const printedPages = page.printedPages
    ? {
        ...page.printedPages,
        parents: page.printedPages.parents.map((parent) => ({
          ...parent,
          ...(parent.head === undefined ? {} : { head: parentResults.get(`${parent.name}:head`)?.html ?? parent.head }),
          ...(parent.foot === undefined ? {} : { foot: parentResults.get(`${parent.name}:foot`)?.html ?? parent.foot }),
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
