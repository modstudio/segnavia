import { z } from 'zod'
import { TextDirection } from './direction.ts'
import { FOLD_KINDS, refineFold, resolveImposition } from './fold.ts'
import { refuseOverflow } from './imposition-fit.ts'
import { PhysicalMargin } from './margins.ts'
import { Orientation, Paper, PaperUnit, sheetMm, toMillimeters } from './paper.ts'
import { MarkColor } from './print.ts'

const ImpositionGap = z.object({
  column: z.number().nonnegative().default(0),
  row: z.number().nonnegative().default(0),
})

export const MAX_IMPOSITION_CELLS = 10_000

export const Imposition = z
  .looseObject({
    paper: Paper,
    orientation: Orientation.default('portrait'),
    unit: PaperUnit.default('mm'),
    margin: PhysicalMargin.default({ top: 0, right: 0, bottom: 0, left: 0 }),
    columns: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    cell: z.object({ width: z.number().positive().optional(), height: z.number().positive() }),
    gap: ImpositionGap.default({ column: 0, row: 0 }),
    fit: z.enum(['contain', 'cover']).default('contain'),
    fill: z.enum(['sequence', 'repeat']).default('sequence'),
    sides: z.enum(['one', 'two']).optional(),
    flip: z.enum(['long', 'short']).default('long'),
    skip: z.number().int().nonnegative().default(0),
    dir: TextDirection.default('ltr'),
    marks: z.boolean().default(false),
    markColor: MarkColor.default('black'),
    cornerMarks: z.boolean().default(false),
    fold: z.enum(FOLD_KINDS).optional(),
    panels: z.array(z.number().positive()).optional(),
  })
  .superRefine((imposition, ctx) => {
    for (const field of ['bleed', 'safe'] as const) {
      if (imposition[field] !== undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `imposition.${field} was removed; set the Document's print.${field} to clear this refusal` })
      }
    }
    if (imposition.markColor === 'registration' && !imposition.marks) {
      ctx.addIssue({ code: 'custom', path: ['markColor'], message: 'markColor requires marks to be true' })
    }
    if (imposition.cornerMarks && !imposition.marks) {
      ctx.addIssue({ code: 'custom', path: ['cornerMarks'], message: 'cornerMarks requires marks to be true' })
    }
    if (imposition.panels !== undefined && !imposition.fold) {
      ctx.addIssue({ code: 'custom', path: ['panels'], message: 'panels needs fold; set fold or remove panels' })
    }
    if (imposition.fold) {
      const panelCount = imposition.panels?.length ?? 0
      if (panelCount > MAX_IMPOSITION_CELLS) {
        ctx.addIssue({
          code: 'custom',
          path: ['panels'],
          message: `the fold has ${panelCount} panels and the ceiling is ${MAX_IMPOSITION_CELLS}; fewer panels clears this refusal`,
        })
        return
      }
      refineFold(imposition, ctx)
      return
    }
    if (imposition.columns === undefined) {
      ctx.addIssue({ code: 'custom', path: ['columns'], message: 'columns is required; give a column count to clear this refusal' })
    }
    if (imposition.rows === undefined) {
      ctx.addIssue({ code: 'custom', path: ['rows'], message: 'rows is required; give a row count to clear this refusal' })
    }
    if (imposition.cell.width === undefined) {
      ctx.addIssue({ code: 'custom', path: ['cell', 'width'], message: 'cell.width is required; give a cell width to clear this refusal' })
    }
    if (imposition.columns === undefined || imposition.rows === undefined || imposition.cell.width === undefined) return
    const cellCount = BigInt(imposition.columns) * BigInt(imposition.rows)
    if (imposition.columns > MAX_IMPOSITION_CELLS || imposition.rows > MAX_IMPOSITION_CELLS || cellCount > BigInt(MAX_IMPOSITION_CELLS)) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns'],
        message: `the grid has ${cellCount} cells and the ceiling is ${MAX_IMPOSITION_CELLS}; fewer columns or rows clears this refusal`,
      })
      return
    }
    const mm = (value: number) => toMillimeters(value, imposition.unit)
    const paper = sheetMm({ paper: imposition.paper, orientation: imposition.orientation })
    const gridWidth = mm(
      imposition.margin.left + imposition.columns * imposition.cell.width + (imposition.columns - 1) * imposition.gap.column + imposition.margin.right,
    )
    const gridHeight = mm(
      imposition.margin.top + imposition.rows * imposition.cell.height + (imposition.rows - 1) * imposition.gap.row + imposition.margin.bottom,
    )
    refuseOverflow(ctx, paper, { width: gridWidth, height: gridHeight })
    const cells = imposition.columns * imposition.rows
    if (imposition.skip >= cells) {
      ctx.addIssue({ code: 'custom', path: ['skip'], message: `skip is ${imposition.skip}, but the grid has ${cells} cells; skip must be less than ${cells}` })
    }
  })
  .transform(({ bleed: _bleed, safe: _safe, ...imposition }) => resolveImposition(imposition))
export type Imposition = z.infer<typeof Imposition>
export type ImpositionInput = z.input<typeof Imposition> & { bleed?: never; safe?: never }
