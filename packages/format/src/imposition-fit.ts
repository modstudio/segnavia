import { roundMillimeters } from './paper.ts'

export type IssueCtx = { addIssue: (issue: { code: 'custom'; path: (string | number)[]; message: string }) => void }

export const PAPER_FIT_TOLERANCE_MM = 0.01

export function refuseOverflow(ctx: IssueCtx, paper: { width: number; height: number }, used: { width: number; height: number }): void {
  if (used.width - paper.width > PAPER_FIT_TOLERANCE_MM) {
    ctx.addIssue({
      code: 'custom',
      path: ['columns'],
      message: `the grid is ${roundMillimeters(used.width)}mm wide and the paper is ${paper.width}mm wide, an overflow of ${roundMillimeters(used.width - paper.width)}mm; reduce the horizontal margins, columns, cell width or column gap`,
    })
  }
  if (used.height - paper.height > PAPER_FIT_TOLERANCE_MM) {
    ctx.addIssue({
      code: 'custom',
      path: ['rows'],
      message: `the grid is ${roundMillimeters(used.height)}mm high and the paper is ${paper.height}mm high, an overflow of ${roundMillimeters(used.height - paper.height)}mm; reduce the vertical margins, rows, cell height or row gap`,
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
