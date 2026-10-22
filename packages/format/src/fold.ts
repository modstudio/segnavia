import type { Orientation, Paper, PaperUnit } from './paper.ts'
import { fromMillimeters, roundMillimeters, sheetMm, toMillimeters } from './paper.ts'

type IssueCtx = { addIssue: (issue: { code: 'custom'; path: (string | number)[]; message: string }) => void }

export const FOLD_KINDS = ['half', 'letter', 'z', 'gate', 'custom'] as const
export type FoldKind = (typeof FOLD_KINDS)[number]

// A tuck-in panel is narrowed so it clears the bulk of the fold it tucks under.
// Finishing guides use 1/32 in to 1/16 in (about 0.8–1.6 mm) per tuck-in panel;
// 1.5 mm is a round value in that range.
export const FOLD_TUCK_IN_MM = 1.5

export const FOLD_WIDTH_TOLERANCE_MM = 0.01

type Edges = { top: number; right: number; bottom: number; left: number }

export type FoldDraft = {
  fold?: FoldKind
  panels?: number[]
  columns?: number
  rows?: number
  sides?: 'one' | 'two'
  fill: 'sequence' | 'repeat'
  skip: number
  gap: { column: number; row: number }
  cell: { width?: number; height: number }
  paper: Paper
  orientation: Orientation
  unit: PaperUnit
  margin: Edges
  bleed: number
  safe: number
}

export function foldColumns(fold: FoldKind, panelCount = 0): number {
  if (fold === 'custom') return panelCount
  return fold === 'half' ? 2 : 3
}

export function foldPanelMap(fold: FoldKind, columns: number): { front: number[]; back: number[] } {
  if (fold === 'gate') return { front: [2, 6, 1], back: [3, 4, 5] }
  const front = [...Array.from({ length: columns - 1 }, (_, index) => columns + 2 + index), 1]
  const back = Array.from({ length: columns }, (_, index) => index + 2)
  return { front, back }
}

export function foldCellPages(fold: FoldKind, columns: number): Array<{ front: number; back: number }> {
  const map = foldPanelMap(fold, columns)
  return Array.from({ length: columns }, (_, cell) => ({
    front: (map.front[cell] ?? 1) - 1,
    back: (map.back[columns - 1 - cell] ?? 1) - 1,
  }))
}

export function foldPageCountMessage(fold: FoldKind, pageCount: number, columns: number): string {
  const need = columns * 2
  return `this ${fold} fold has ${pageCount} pages and needs ${need} (2 × ${columns} panels); pass ${need} pages to clear this refusal`
}

function splitSum(available: number, count: number): number[] {
  const share = available / count
  const widths = Array.from({ length: count - 1 }, () => roundMillimeters(share))
  const used = widths.reduce((sum, width) => sum + width, 0)
  widths.push(roundMillimeters(available - used))
  return widths
}

export function presetPanelWidthsMm(fold: Exclude<FoldKind, 'custom'>, availableMm: number): number[] {
  if (fold === 'letter') {
    const tuck = roundMillimeters(availableMm / 3 - FOLD_TUCK_IN_MM)
    const rest = availableMm - tuck
    const second = roundMillimeters(rest / 2)
    return [tuck, second, roundMillimeters(rest - second)]
  }
  if (fold === 'gate') {
    const flap = roundMillimeters(availableMm / 4 - FOLD_TUCK_IN_MM)
    return [flap, roundMillimeters(availableMm - flap * 2), flap]
  }
  return splitSum(availableMm, fold === 'half' ? 2 : 3)
}

function availableWidthMm(draft: FoldDraft): number {
  const paper = sheetMm({ paper: draft.paper, orientation: draft.orientation })
  return roundMillimeters(paper.width - toMillimeters(draft.margin.left, draft.unit) - toMillimeters(draft.margin.right, draft.unit))
}

export function panelWidthsMm(draft: FoldDraft): number[] {
  if (draft.panels) return draft.panels.map((width) => toMillimeters(width, draft.unit))
  if (!draft.fold || draft.fold === 'custom') return []
  return presetPanelWidthsMm(draft.fold, availableWidthMm(draft))
}

function panelsInUnit(draft: FoldDraft): number[] {
  if (draft.panels) return draft.panels
  return panelWidthsMm(draft).map((width) => (draft.unit === 'mm' ? width : fromMillimeters(width, draft.unit)))
}

function issue(ctx: IssueCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: 'custom', path, message })
}

function refuseShape(draft: FoldDraft, ctx: IssueCtx, columns: number): void {
  if (draft.rows !== undefined && draft.rows !== 1) {
    issue(ctx, ['rows'], `rows is ${draft.rows}, but a fold is one row; set rows to 1 or omit it to clear this refusal`)
  }
  if (draft.sides === 'one') {
    issue(ctx, ['sides'], 'sides is one, but a fold is two-sided; set sides to two or omit it to clear this refusal')
  }
  if (draft.fill === 'repeat') {
    issue(ctx, ['fill'], 'fill is repeat, but a fold fills in sequence; set fill to sequence or omit it to clear this refusal')
  }
  if (draft.skip !== 0) {
    issue(ctx, ['skip'], `skip is ${draft.skip}, but a fold has no skipped cells; set skip to 0 or omit it to clear this refusal`)
  }
  if (draft.gap.column !== 0) {
    issue(ctx, ['gap', 'column'], `column gap is ${draft.gap.column}, but a fold's panels touch; set gap.column to 0 or omit it to clear this refusal`)
  }
  if (draft.columns !== undefined && draft.columns !== columns) {
    issue(
      ctx,
      ['columns'],
      `columns is ${draft.columns}, but a ${draft.fold} fold has ${columns} panels; set columns to ${columns} or omit it to clear this refusal`,
    )
  }
}

export function refineFold(draft: FoldDraft, ctx: IssueCtx): void {
  const fold = draft.fold
  if (!fold) return
  if (fold === 'custom' && (draft.panels === undefined || draft.panels.length < 2)) {
    issue(ctx, ['panels'], 'a custom fold needs panels with at least two widths; give panel widths that sum to the paper width to clear this refusal')
    return
  }
  const columns = foldColumns(fold, draft.panels?.length)
  if (fold !== 'custom' && draft.panels !== undefined && draft.panels.length !== columns) {
    issue(
      ctx,
      ['panels'],
      `panels has ${draft.panels.length} widths and a ${fold} fold has ${columns} columns; give ${columns} widths or omit panels to use the preset`,
    )
    return
  }
  refuseShape(draft, ctx, columns)
  const widths = panelWidthsMm(draft)
  if (widths.some((width) => width <= 0)) {
    issue(
      ctx,
      ['panels'],
      `a ${fold} fold has a non-positive panel after the ${FOLD_TUCK_IN_MM}mm tuck-in allowance; use a wider paper or override panels to clear this refusal`,
    )
    return
  }
  const paper = sheetMm({ paper: draft.paper, orientation: draft.orientation })
  const marginLeft = toMillimeters(draft.margin.left, draft.unit)
  const marginRight = toMillimeters(draft.margin.right, draft.unit)
  const sum = roundMillimeters(marginLeft + widths.reduce((total, width) => total + width, 0) + marginRight)
  if (Math.abs(sum - paper.width) > FOLD_WIDTH_TOLERANCE_MM) {
    issue(
      ctx,
      ['panels'],
      `the panels and horizontal margins sum to ${sum}mm and the paper is ${paper.width}mm wide; change panels or margins so they sum to ${paper.width}mm to clear this refusal`,
    )
  }
  const height = toMillimeters(draft.margin.top, draft.unit) + toMillimeters(draft.cell.height, draft.unit) + toMillimeters(draft.margin.bottom, draft.unit)
  if (height - paper.height > FOLD_WIDTH_TOLERANCE_MM) {
    issue(
      ctx,
      ['rows'],
      `the grid is ${roundMillimeters(height)}mm high and the paper is ${paper.height}mm high, an overflow of ${roundMillimeters(height - paper.height)}mm; reduce the vertical margins or cell height`,
    )
  }
  const safe = toMillimeters(draft.safe, draft.unit)
  const narrowest = Math.min(...widths)
  if (safe * 2 >= narrowest) {
    issue(
      ctx,
      ['safe'],
      `safe is ${roundMillimeters(safe)}mm on the left and right, but the cell is ${roundMillimeters(narrowest)}mm wide; safe must leave area inside the cell`,
    )
  }
  const cellHeight = toMillimeters(draft.cell.height, draft.unit)
  if (safe * 2 >= cellHeight) {
    issue(
      ctx,
      ['safe'],
      `safe is ${roundMillimeters(safe)}mm on the top and bottom, but the cell is ${roundMillimeters(cellHeight)}mm high; safe must leave area inside the cell`,
    )
  }
}

export function resolveImposition<T extends FoldDraft>(
  value: T,
): T & { columns: number; rows: number; sides: 'one' | 'two'; cell: { width: number; height: number } } {
  if (!value.fold) {
    return {
      ...value,
      columns: value.columns ?? 1,
      rows: value.rows ?? 1,
      sides: value.sides ?? 'one',
      cell: { width: value.cell.width ?? 1, height: value.cell.height },
    }
  }
  const columns = foldColumns(value.fold, value.panels?.length)
  const panels = panelsInUnit(value)
  return {
    ...value,
    columns,
    rows: 1,
    sides: 'two',
    fill: 'sequence',
    skip: 0,
    gap: { column: 0, row: value.gap.row },
    panels,
    cell: { width: panels[0] ?? value.cell.width ?? 1, height: value.cell.height },
  }
}
