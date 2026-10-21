import { z } from 'zod'
import type { Print } from './index.ts'

export const NAMED_PAPERS = [
  'letter',
  'legal',
  'tabloid',
  'a3',
  'a4',
  'a5',
  'business-card-us',
  'business-card-eu',
  'business-card-square-us',
  'business-card-slim-us',
  'postcard-4x6',
  'postcard-5x7',
  'postcard-6x9',
  'postcard-6x11',
  'card-square-4in',
  'half-letter',
  'a6',
  'dl',
  'rack-card-4x9',
  'rack-card-3.5x8.5',
  'poster-12x18',
  'poster-16x20',
  'poster-18x24',
  'poster-24x36',
  'a2',
  'a1',
  'a0',
] as const
export type NamedPaper = (typeof NAMED_PAPERS)[number]

export const PAPER_GROUPS = ['Office', 'Cards', 'Leaflets', 'Posters'] as const
export type PaperGroup = (typeof PAPER_GROUPS)[number]

export interface NamedPaperMetadata {
  name: string
  group: PaperGroup
  size: string
}

export const PAPER_METADATA = {
  letter: { name: 'Letter', group: 'Office', size: '8.5 × 11 in' },
  legal: { name: 'Legal', group: 'Office', size: '8.5 × 14 in' },
  tabloid: { name: 'Tabloid', group: 'Office', size: '11 × 17 in' },
  a3: { name: 'A3', group: 'Office', size: '297 × 420 mm' },
  a4: { name: 'A4', group: 'Office', size: '210 × 297 mm' },
  a5: { name: 'A5', group: 'Office', size: '148 × 210 mm' },
  'business-card-us': { name: 'Business card (US)', group: 'Cards', size: '3.5 × 2 in' },
  'business-card-eu': { name: 'Business card (EU)', group: 'Cards', size: '85 × 55 mm' },
  'business-card-square-us': { name: 'Square business card (US)', group: 'Cards', size: '2.5 × 2.5 in' },
  'business-card-slim-us': { name: 'Slim business card (US)', group: 'Cards', size: '3.5 × 1.75 in' },
  'postcard-4x6': { name: 'Postcard 4 × 6', group: 'Cards', size: '4 × 6 in' },
  'postcard-5x7': { name: 'Postcard 5 × 7', group: 'Cards', size: '5 × 7 in' },
  'postcard-6x9': { name: 'Postcard 6 × 9', group: 'Cards', size: '6 × 9 in' },
  'postcard-6x11': { name: 'Postcard 6 × 11', group: 'Cards', size: '6 × 11 in' },
  'card-square-4in': { name: 'Square card 4 in', group: 'Cards', size: '4 × 4 in' },
  'half-letter': { name: 'Half letter', group: 'Leaflets', size: '5.5 × 8.5 in' },
  a6: { name: 'A6', group: 'Leaflets', size: '105 × 148 mm' },
  dl: { name: 'DL', group: 'Leaflets', size: '99 × 210 mm' },
  'rack-card-4x9': { name: 'Rack card 4 × 9', group: 'Leaflets', size: '4 × 9 in' },
  'rack-card-3.5x8.5': { name: 'Rack card 3.5 × 8.5', group: 'Leaflets', size: '3.5 × 8.5 in' },
  'poster-12x18': { name: 'Poster 12 × 18', group: 'Posters', size: '12 × 18 in' },
  'poster-16x20': { name: 'Poster 16 × 20', group: 'Posters', size: '16 × 20 in' },
  'poster-18x24': { name: 'Poster 18 × 24', group: 'Posters', size: '18 × 24 in' },
  'poster-24x36': { name: 'Poster 24 × 36', group: 'Posters', size: '24 × 36 in' },
  a2: { name: 'A2', group: 'Posters', size: '420 × 594 mm' },
  a1: { name: 'A1', group: 'Posters', size: '594 × 841 mm' },
  a0: { name: 'A0', group: 'Posters', size: '841 × 1189 mm' },
} satisfies Record<NamedPaper, NamedPaperMetadata>

export const CUSTOM_PAPER_MIN_MM = 10
export const CUSTOM_PAPER_MAX_MM = 2000
const PaperUnit = z.enum(['mm', 'in', 'pt'])
export type PaperUnit = z.infer<typeof PaperUnit>

const CustomPaper = z.object({ width: z.number().positive(), height: z.number().positive(), unit: PaperUnit }).superRefine((paper, ctx) => {
  for (const side of ['width', 'height'] as const) {
    const millimeters = toMillimeters(paper[side], paper.unit)
    if (millimeters < CUSTOM_PAPER_MIN_MM || millimeters > CUSTOM_PAPER_MAX_MM) {
      ctx.addIssue({
        code: 'custom',
        path: [side],
        message: `${side} must be between ${CUSTOM_PAPER_MIN_MM}mm and ${CUSTOM_PAPER_MAX_MM}mm`,
      })
    }
  }
})
export const Paper = z.union([z.enum(NAMED_PAPERS), CustomPaper])
export type Paper = z.infer<typeof Paper>

const PrintSettingShape = { paper: Paper, orientation: z.enum(['portrait', 'landscape']) } as const
// Reading stored history ignores fields added by a newer host. Writes use the
// strict form so a typo cannot silently enter storage.
export const PrintSetting = z.object(PrintSettingShape)
export type PrintSetting = z.infer<typeof PrintSetting>
export const PrintSettingInput = z.strictObject(PrintSettingShape)
export type PrintSettingInput = z.input<typeof PrintSettingInput>

export const MM_PER_PT = 25.4 / 72
export const MARK_LENGTH_MM = 5
export const MARK_GAP_MM = 1

export const roundMillimeters = (mm: number) => Math.round(mm * 100) / 100

export function toMillimeters(value: number, unit: 'mm' | 'in' | 'pt'): number {
  return value * (unit === 'in' ? 25.4 : unit === 'pt' ? MM_PER_PT : 1)
}

type PaperSize = { width: number; height: number; unit: 'mm' | 'in' }

const PAPER_SIZE = {
  letter: { width: 8.5, height: 11, unit: 'in' },
  legal: { width: 8.5, height: 14, unit: 'in' },
  tabloid: { width: 11, height: 17, unit: 'in' },
  a3: { width: 297, height: 420, unit: 'mm' },
  a4: { width: 210, height: 297, unit: 'mm' },
  a5: { width: 148, height: 210, unit: 'mm' },
  'business-card-us': { width: 2, height: 3.5, unit: 'in' },
  'business-card-eu': { width: 55, height: 85, unit: 'mm' },
  'business-card-square-us': { width: 2.5, height: 2.5, unit: 'in' },
  'business-card-slim-us': { width: 1.75, height: 3.5, unit: 'in' },
  'postcard-4x6': { width: 4, height: 6, unit: 'in' },
  'postcard-5x7': { width: 5, height: 7, unit: 'in' },
  'postcard-6x9': { width: 6, height: 9, unit: 'in' },
  'postcard-6x11': { width: 6, height: 11, unit: 'in' },
  'card-square-4in': { width: 4, height: 4, unit: 'in' },
  'half-letter': { width: 5.5, height: 8.5, unit: 'in' },
  a6: { width: 105, height: 148, unit: 'mm' },
  dl: { width: 99, height: 210, unit: 'mm' },
  'rack-card-4x9': { width: 4, height: 9, unit: 'in' },
  'rack-card-3.5x8.5': { width: 3.5, height: 8.5, unit: 'in' },
  'poster-12x18': { width: 12, height: 18, unit: 'in' },
  'poster-16x20': { width: 16, height: 20, unit: 'in' },
  'poster-18x24': { width: 18, height: 24, unit: 'in' },
  'poster-24x36': { width: 24, height: 36, unit: 'in' },
  a2: { width: 420, height: 594, unit: 'mm' },
  a1: { width: 594, height: 841, unit: 'mm' },
  a0: { width: 841, height: 1189, unit: 'mm' },
} satisfies Record<NamedPaper, PaperSize>

const paperMillimeters = (): Record<NamedPaper, { width: number; height: number }> =>
  Object.fromEntries(
    NAMED_PAPERS.map((paper) => {
      const { width, height, unit } = PAPER_SIZE[paper]
      return [paper, { width: roundMillimeters(toMillimeters(width, unit)), height: roundMillimeters(toMillimeters(height, unit)) }]
    }),
  ) as Record<NamedPaper, { width: number; height: number }>

// Millimeters per named paper, portrait.
export const PAPER_MM: Record<Extract<Paper, string>, { width: number; height: number }> = paperMillimeters()

// The sheet a print setting describes, in millimeters, with orientation applied.
export function sheetMm(print: Pick<Print, 'paper' | 'orientation'>): { width: number; height: number } {
  const portrait =
    typeof print.paper === 'string'
      ? PAPER_MM[print.paper]
      : { width: toMillimeters(print.paper.width, print.paper.unit), height: toMillimeters(print.paper.height, print.paper.unit) }
  const [short, long] = [Math.min(portrait.width, portrait.height), Math.max(portrait.width, portrait.height)]
  return print.orientation === 'landscape'
    ? { width: roundMillimeters(long), height: roundMillimeters(short) }
    : { width: roundMillimeters(short), height: roundMillimeters(long) }
}

// CSS pixels per millimeter at the 96 dpi every browser lays out at.
export const PX_PER_MM = 96 / 25.4

export function printProperties(print: Pick<Print, 'bleed' | 'safe'>, unit: 'mm' | 'in' | 'pt' = 'mm'): string {
  return `:root{--segnavia-bleed:${roundMillimeters(toMillimeters(print.bleed, unit))}mm;--segnavia-safe:${roundMillimeters(toMillimeters(print.safe, unit))}mm}`
}

export function printPadding(edges: { top: number; right: number; bottom: number; left: number }): string {
  // Padding uses physical sides because these are edges on paper, independent
  // of the page's reading direction.
  return `:where(html){padding:${[edges.top, edges.right, edges.bottom, edges.left].map((value) => `${value}mm`).join(' ')}}`
}

export interface PaperBox {
  x: number
  y: number
  width: number
  height: number
}

export interface MarkSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PrintBoxes {
  media: { width: number; height: number }
  bleedBox: PaperBox
  trim: PaperBox
  safeBox: PaperBox
  marks: MarkSegment[]
}

export function printBoxes(print: Print): PrintBoxes {
  const sheet = sheetMm(print)
  const outside = print.marks ? MARK_GAP_MM + MARK_LENGTH_MM : 0
  const bleedBox = {
    x: outside,
    y: outside,
    width: roundMillimeters(sheet.width + print.bleed * 2),
    height: roundMillimeters(sheet.height + print.bleed * 2),
  }
  const trim = {
    x: roundMillimeters(outside + print.bleed),
    y: roundMillimeters(outside + print.bleed),
    width: sheet.width,
    height: sheet.height,
  }
  const safeBox = {
    x: roundMillimeters(trim.x + print.safe),
    y: roundMillimeters(trim.y + print.safe),
    width: roundMillimeters(trim.width - print.safe * 2),
    height: roundMillimeters(trim.height - print.safe * 2),
  }
  const media = { width: roundMillimeters(bleedBox.width + outside * 2), height: roundMillimeters(bleedBox.height + outside * 2) }
  if (!print.marks) return { media, bleedBox, trim, safeBox, marks: [] }

  const leftStart = roundMillimeters(bleedBox.x - MARK_GAP_MM)
  const rightStart = roundMillimeters(bleedBox.x + bleedBox.width + MARK_GAP_MM)
  const topStart = roundMillimeters(bleedBox.y - MARK_GAP_MM)
  const bottomStart = roundMillimeters(bleedBox.y + bleedBox.height + MARK_GAP_MM)
  const right = roundMillimeters(rightStart + MARK_LENGTH_MM)
  const bottom = roundMillimeters(bottomStart + MARK_LENGTH_MM)
  const trimRight = roundMillimeters(trim.x + trim.width)
  const trimBottom = roundMillimeters(trim.y + trim.height)
  const marks = [
    { x1: roundMillimeters(leftStart - MARK_LENGTH_MM), y1: trim.y, x2: leftStart, y2: trim.y },
    { x1: trim.x, y1: roundMillimeters(topStart - MARK_LENGTH_MM), x2: trim.x, y2: topStart },
    { x1: rightStart, y1: trim.y, x2: right, y2: trim.y },
    { x1: trimRight, y1: roundMillimeters(topStart - MARK_LENGTH_MM), x2: trimRight, y2: topStart },
    { x1: roundMillimeters(leftStart - MARK_LENGTH_MM), y1: trimBottom, x2: leftStart, y2: trimBottom },
    { x1: trim.x, y1: bottomStart, x2: trim.x, y2: bottom },
    { x1: rightStart, y1: trimBottom, x2: right, y2: trimBottom },
    { x1: trimRight, y1: bottomStart, x2: trimRight, y2: bottom },
  ]
  return { media, bleedBox, trim, safeBox, marks }
}
