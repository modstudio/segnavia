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
export const FULL_PAGE_SIZE = { width: 'full', height: 'auto' } as const

export const FlowingWidth = z.union([z.literal('full'), z.literal('standard'), z.literal('wide'), z.number().int().positive()])
export type FlowingWidth = z.infer<typeof FlowingWidth>

export const PageWidths = z.object({ standard: z.number().positive().optional(), wide: z.number().positive().optional() })
export type PageWidths = z.infer<typeof PageWidths>

const FlowingPageSize = z.object({ width: FlowingWidth, height: z.literal('auto') })
const LegacyFluidPageSize = z.literal('fluid').transform(() => FULL_PAGE_SIZE)

export const PageSize = z.union([LegacyFluidPageSize, Size, FlowingPageSize])
export type PageSize = z.infer<typeof PageSize>

export interface ResolvedPageWidth {
  measure?: number
  viewportWidth: number
}

export const PageBody = z.union([z.strictObject({ html: z.string() }), z.strictObject({ markdown: z.string() })])
export type PageBody = z.infer<typeof PageBody>

export function resolvePageWidth(size: PageSize, overrides: PageWidths = {}): ResolvedPageWidth {
  const width = size.width
  if (typeof width === 'number') return { measure: width, viewportWidth: width }
  if (width === 'full') return { viewportWidth: overrides.standard ?? PAGE_WIDTHS.standard }
  const measure = overrides[width] ?? PAGE_WIDTHS[width]
  return { measure, viewportWidth: measure }
}

const PageShape = z
  .object({
    id: z.string().optional(),
    body: PageBody.optional(),
    html: z.string().optional(),
    markdown: z.string().optional(),
    size: PageSize.default(FULL_PAGE_SIZE),
    scripts: Scripts.default('refuse'),
    dir: Direction.optional(),
    lang: z.string().optional(),
    print: Print.optional(),
    printedPages: PrintedPages.optional(),
    slots: Slots.optional(),
    fonts: z.array(FontReference).optional(),
  })
  .superRefine((page, ctx) => {
    const fields = (['body', 'html', 'markdown'] as const).filter((field) => page[field] !== undefined)
    if (fields.length === 0) ctx.addIssue({ code: 'custom', path: ['body'], message: 'body, html or markdown is required; provide exactly one page body' })
    if (fields.length > 1) {
      const names = fields.join(', ')
      for (const field of fields)
        ctx.addIssue({ code: 'custom', path: [field], message: `${names} were all given; provide exactly one of body, html or markdown` })
    }
    for (const issue of pagePrintedPagesIssues(page)) ctx.addIssue({ code: 'custom', ...issue })
  })

export const Page = PageShape.transform(({ html, markdown, body, ...page }) => ({
  ...page,
  body: body ?? (html !== undefined ? { html } : markdown !== undefined ? { markdown } : { html: '' }),
}))
export type Page = z.infer<typeof Page>
export type PageInput = z.input<typeof Page>
