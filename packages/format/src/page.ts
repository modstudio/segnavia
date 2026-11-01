import { z } from 'zod'
import { Size } from './deck.ts'
import { Direction } from './direction.ts'
import { FontReference } from './fonts.ts'
import { Print } from './print.ts'
import { PrintedPages, pagePrintedPagesIssues } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'

// A page is designed for the screen at whatever size it needs: fluid (the
// viewer's width, as tall as its content), a fixed sheet, or a fixed width
// that grows with its content.
export const PageSize = z.union([z.literal('fluid'), Size, z.object({ width: z.number().int().positive(), height: z.literal('auto') })])
export type PageSize = z.infer<typeof PageSize>

export const Page = z
  .object({
    id: z.string().optional(),
    html: z.string(),
    size: PageSize.default('fluid'),
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
