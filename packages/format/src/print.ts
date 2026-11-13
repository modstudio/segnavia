import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { LogicalMargin } from './margins.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'

export const MarkColor = z.enum(['black', 'registration'])
export type MarkColor = z.infer<typeof MarkColor>

// Paper exists only to export a page at a standard printed size. A page
// without it exports at its own size. Margins are in millimeters.
export const PRESS_GEOMETRY_FIELDS = ['bleed', 'safe', 'marks', 'markColor'] as const
export type PressGeometryField = (typeof PRESS_GEOMETRY_FIELDS)[number]

const pressGeometryFields = {
  bleed: z.number().nonnegative().default(0),
  safe: z.number().nonnegative().default(0),
  marks: z.boolean().default(false),
  markColor: MarkColor.default('black'),
}

export const PressGeometry = closedObject(pressGeometryFields).superRefine((press, ctx) => {
  if (press.markColor === 'registration' && !press.marks) {
    ctx.addIssue({ code: 'custom', path: ['markColor'], message: 'markColor requires marks to be true' })
  }
})
export type PressGeometry = z.infer<typeof PressGeometry>
export type PressGeometryInput = z.input<typeof PressGeometry>

export function pressSafeAreaIssues(press: Pick<PressGeometry, 'safe'>, trim: { width: number; height: number }): string[] {
  const issues: string[] = []
  if (press.safe * 2 >= trim.width) {
    issues.push(`safe is ${press.safe}mm on the left and right, but the trim is ${trim.width}mm wide; safe must leave area inside the trim`)
  }
  if (press.safe * 2 >= trim.height) {
    issues.push(`safe is ${press.safe}mm on the top and bottom, but the trim is ${trim.height}mm high; safe must leave area inside the trim`)
  }
  return issues
}

const PrintShape = closedObject({
  paper: Paper,
  orientation: Orientation.default('portrait'),
  margin: LogicalMargin.optional(),
  ...pressGeometryFields,
})

export const Print = PrintShape.superRefine((print, ctx) => {
  if (print.markColor === 'registration' && !print.marks) {
    ctx.addIssue({ code: 'custom', path: ['markColor'], message: 'markColor requires marks to be true' })
  }
  for (const message of pressSafeAreaIssues(print, sheetMm(print))) ctx.addIssue({ code: 'custom', path: ['safe'], message })
})
export type Print = z.infer<typeof Print>
export type PrintInput = z.input<typeof Print>
