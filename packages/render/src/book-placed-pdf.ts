import type { Page as Tab } from 'playwright-core'
import { prepareBackdropRasters, tagBackdropRasters } from './effects/raster.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { printWithOverflow } from './overflow.ts'
import { drawPlacedPdfPages, hasPlacedPdfPages, measurePlacedPdfPages, preparePlacedPdfPages } from './placed-pdf-page.ts'
import type { ParsedBookPdfOptions } from './renderer.ts'

export async function printBookPartWithPlacedPdf(
  tab: Tab,
  pdf: Parameters<Tab['pdf']>[0],
  pageWidth: number,
  part: BookOverflowPart,
  options: ParsedBookPdfOptions,
): Promise<PrintResult<true>> {
  const captures = await prepareBackdropRasters(tab, options.effects)
  if (hasPlacedPdfPages(options)) await preparePlacedPdfPages(tab)
  const printed = await printWithOverflow(tab, pageWidth, part, pdf)
  const placements = hasPlacedPdfPages(options) ? await measurePlacedPdfPages(tab, printed.overflow.scale) : []
  return { ...printed, bytes: await drawPlacedPdfPages(await tagBackdropRasters(printed.bytes, captures), placements, options) }
}
