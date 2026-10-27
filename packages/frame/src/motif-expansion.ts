import {
  type FontReference,
  LIBRARY_MOTIF_PREFIX,
  MOTIF_ATTRIBUTE,
  type MotifSource,
  type Page,
  PRINTED_PAGE_CONTEXT,
  printProperties,
  type SlotsOptions,
} from '@segnavia/format'
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
  const parentRegions =
    page.printedPages?.parents.flatMap((parent) =>
      (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
    ) ?? []
  if (!motifs) {
    const reservedPattern = new RegExp(`\\b${MOTIF_ATTRIBUTE}\\s*=\\s*["']${LIBRARY_MOTIF_PREFIX}`)
    if ([page.html, ...parentRegions.map(({ html }) => html)].some((html) => reservedPattern.test(html))) {
      throw new MotifRefusedError(
        `A motif placement could not establish a host motif key because "${LIBRARY_MOTIF_PREFIX}" is reserved for library motifs; rename the motif key to clear this refusal.`,
      )
    }
    const motifPattern = new RegExp(`\\b${MOTIF_ATTRIBUTE}\\s*=`)
    if (parentRegions.some(({ html }) => motifPattern.test(html))) {
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
  const parentResults = new Map(
    await Promise.all(
      parentRegions.map(
        async ({ name, region, html }) =>
          [
            `${name}:${region}`,
            await expandMotifs(html, {
              source: motifs.source,
              pins: motifs.pins,
              lang: page.lang,
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
