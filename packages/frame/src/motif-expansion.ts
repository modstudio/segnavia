import type { MotifSource, Page } from '@segnavia/format'
import { type ExpandedMotifs, expandMotifs } from '@segnavia/html'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export async function expandFramePage(page: Page, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<Page> {
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

export function expandFramePages(pages: Page[], motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<Page[]> {
  return Promise.all(pages.map((page) => expandFramePage(page, motifs, signal)))
}
