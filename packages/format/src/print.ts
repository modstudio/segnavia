import { z } from 'zod'
import { Orientation, Paper, sheetMm } from './paper.ts'

export const Margin = z.object({
  top: z.number().nonnegative().default(0),
  right: z.number().nonnegative().default(0),
  bottom: z.number().nonnegative().default(0),
  left: z.number().nonnegative().default(0),
})

export const MarkColor = z.enum(['black', 'registration'])
export type MarkColor = z.infer<typeof MarkColor>

// Paper exists only to export a page at a standard printed size. A page
// without it exports at its own size. Margins are in millimeters.
export const Print = z
  .object({
    paper: Paper,
    orientation: Orientation.default('portrait'),
    margin: Margin.optional(),
    bleed: z.number().nonnegative().default(0),
    safe: z.number().nonnegative().default(0),
    marks: z.boolean().default(false),
    markColor: MarkColor.default('black'),
  })
  .superRefine((print, ctx) => {
    if (print.markColor === 'registration' && !print.marks) {
      ctx.addIssue({ code: 'custom', path: ['markColor'], message: 'markColor requires marks to be true' })
    }
    const trim = sheetMm(print)
    if (print.safe * 2 >= trim.width) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${print.safe}mm on the left and right, but the trim is ${trim.width}mm wide; safe must leave area inside the trim`,
      })
    }
    if (print.safe * 2 >= trim.height) {
      ctx.addIssue({
        code: 'custom',
        path: ['safe'],
        message: `safe is ${print.safe}mm on the top and bottom, but the trim is ${trim.height}mm high; safe must leave area inside the trim`,
      })
    }
  })
export type Print = z.infer<typeof Print>
export type PrintInput = z.input<typeof Print>
