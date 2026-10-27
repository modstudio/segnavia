import type { MotifSource, Page } from '@segnavia/format'
import { type ExpandedMotifs, expandMotifs } from '@segnavia/html'

export interface RenderMotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export async function expandRenderPage(page: Page, motifs: RenderMotifsOptions | undefined, signal: AbortSignal): Promise<Page> {
  if (!motifs) return page
  const result = await expandMotifs(page.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang: page.lang,
    scripts: page.scripts,
    prefix: 'slot',
    signal,
  })
  signal.throwIfAborted()
  motifs.placed?.({ placed: result.placed, fonts: result.fonts, unavailable: result.unavailable })
  return { ...page, html: result.html }
}

export function expandRenderPages(pages: Page[], motifs: RenderMotifsOptions | undefined, signal: AbortSignal): Promise<Page[]> {
  return Promise.all(pages.map((page) => expandRenderPage(page, motifs, signal)))
}
