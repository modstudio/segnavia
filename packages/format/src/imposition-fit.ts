import { roundMillimeters } from './paper.ts'

export type IssueCtx = { addIssue: (issue: { code: 'custom'; path: (string | number)[]; message: string }) => void }

export const PAPER_FIT_TOLERANCE_MM = 0.01

const GRID_WIDTH_REMEDY = 'reduce the horizontal margins, columns, cell width or column gap'
const GRID_HEIGHT_REMEDY = 'reduce the vertical margins, rows, cell height or row gap'

export type OverflowAxis = {
  path?: (string | number)[]
  subject?: string
  remedy?: string
}

export function refuseOverflow(
  ctx: IssueCtx,
  paper: { width: number; height: number },
  used: { width?: number; height?: number },
  axis: { width?: OverflowAxis; height?: OverflowAxis } = {},
): void {
  const width = used.width
  if (width !== undefined && width - paper.width > PAPER_FIT_TOLERANCE_MM) {
    ctx.addIssue({
      code: 'custom',
      path: axis.width?.path ?? ['columns'],
      message: `${axis.width?.subject ?? 'the grid'} is ${roundMillimeters(width)}mm wide and the paper is ${paper.width}mm wide, an overflow of ${roundMillimeters(width - paper.width)}mm; ${axis.width?.remedy ?? GRID_WIDTH_REMEDY}`,
    })
  }
  const height = used.height
  if (height !== undefined && height - paper.height > PAPER_FIT_TOLERANCE_MM) {
    ctx.addIssue({
      code: 'custom',
      path: axis.height?.path ?? ['rows'],
      message: `${axis.height?.subject ?? 'the grid'} is ${roundMillimeters(height)}mm high and the paper is ${paper.height}mm high, an overflow of ${roundMillimeters(height - paper.height)}mm; ${axis.height?.remedy ?? GRID_HEIGHT_REMEDY}`,
    })
  }
}

export function refuseSafe(ctx: IssueCtx, safe: number, cell: { width: number; height: number }): void {
  if (safe * 2 >= cell.width) {
    ctx.addIssue({
      code: 'custom',
      path: ['safe'],
      message: `safe is ${roundMillimeters(safe)}mm on the left and right, but the cell is ${roundMillimeters(cell.width)}mm wide; safe must leave area inside the cell`,
    })
  }
  if (safe * 2 >= cell.height) {
    ctx.addIssue({
      code: 'custom',
      path: ['safe'],
      message: `safe is ${roundMillimeters(safe)}mm on the top and bottom, but the cell is ${roundMillimeters(cell.height)}mm high; safe must leave area inside the cell`,
    })
  }
}
