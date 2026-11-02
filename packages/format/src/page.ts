import { z } from 'zod'
import { Size } from './deck.ts'
import { Direction } from './direction.ts'
import { FontReference } from './fonts.ts'
import { Print } from './print.ts'
import { PrintedPages, pagePrintedPagesIssues } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'

// A page is designed for the screen at whatever size it needs: a flowing
// measure, a fixed sheet, or an exact width that grows with its content.
export const PAGE_WIDTHS = { standard: 1024, wide: 1440 } as const

export const FlowingWidth = z.union([z.literal('full'), z.literal('standard'), z.literal('wide'), z.number().int().positive()])
export type FlowingWidth = z.infer<typeof FlowingWidth>

export const PageWidths = z.object({ standard: z.number().positive().optional(), wide: z.number().positive().optional() })
export type PageWidths = z.infer<typeof PageWidths>

const FlowingPageSize = z.object({ width: FlowingWidth, height: z.literal('auto') })
const LegacyFluidPageSize = z.literal('fluid').transform(() => ({ width: 'full' as const, height: 'auto' as const }))

export const PageSize = z.union([LegacyFluidPageSize, Size, FlowingPageSize])
export type PageSize = z.infer<typeof PageSize>

export interface ResolvedPageWidth {
  measure?: number
  viewportWidth: number
}

export function resolvePageWidth(size: PageSize, overrides: PageWidths = {}): ResolvedPageWidth {
  const width = size.width
  if (typeof width === 'number') return { measure: width, viewportWidth: width }
  if (width === 'full') return { viewportWidth: overrides.standard ?? PAGE_WIDTHS.standard }
  const measure = overrides[width] ?? PAGE_WIDTHS[width]
  return { measure, viewportWidth: measure }
}

export const Page = z
  .object({
    id: z.string().optional(),
    html: z.string(),
    size: PageSize.default({ width: 'full', height: 'auto' }),
    scripts: Scripts.default('refuse'),
    dir: Direction.optional(),
    lang: z.string().optional(),
    print: Print.optional(),
    printedPages: PrintedPages.optional(),
    slots: Slots.optional(),
    fonts: z.array(FontReference).optional(),
  })
  .superRefine((page, ctx) => {
    for (const issue of pagePrintedPagesIssues(page)) ctx.addIssue({ code: 'custom', ...issue })
  })
export type Page = z.infer<typeof Page>
export type PageInput = z.input<typeof Page>
