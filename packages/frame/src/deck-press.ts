import { type Deck, type MarkColor, Print, type PrintBoxes, type PrintInput, PX_PER_MM, pressBoxes, usesPressLayout } from '@segnavia/format'
import { NOTES_PAPER } from './notes-layout.ts'

export interface DeckSheetPrint {
  bleed?: number
  safe?: number
  marks?: boolean
  markColor?: MarkColor
}

export interface DeckSheetGeometry {
  print: Print
  boxes: PrintBoxes
  active: boolean
  sheet: { width: number; height: number }
  padding: number
}

interface DeckPressOptions {
  sheet?: DeckSheetPrint
  notesPaper?: PrintInput
  layout?: 'slides' | 'notes'
  imposition?: unknown
  preferCssPageSize?: boolean
}

function invalidSetting(setting: 'sheet' | 'notesPaper', field: PropertyKey, message: string): RangeError {
  return new RangeError(
    `The ${setting} setting is invalid: ${String(field)} ${message}. Correct ${setting}.${String(field)}, or remove ${setting}, to clear this refusal.`,
  )
}

function parsePrint(setting: 'sheet' | 'notesPaper', input: PrintInput): Print {
  const result = Print.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw invalidSetting(setting, issue?.path.at(-1) ?? setting, issue?.message ?? 'is invalid')
}

export function deckSheetGeometry(size: Deck['size'], sheet: DeckSheetPrint | undefined): DeckSheetGeometry | undefined {
  if (!sheet) return undefined
  const width = size.width / PX_PER_MM
  const height = size.height / PX_PER_MM
  const print = parsePrint('sheet', {
    bleed: sheet.bleed,
    safe: sheet.safe,
    marks: sheet.marks,
    markColor: sheet.markColor,
    paper: { width: Math.min(width, height), height: Math.max(width, height), unit: 'mm' },
    orientation: width > height ? 'landscape' : 'portrait',
  })
  const boxes = pressBoxes({ width, height }, print)
  const active = usesPressLayout(print)
  return {
    print,
    boxes,
    active,
    sheet: active ? { width: boxes.bleedBox.width * PX_PER_MM, height: boxes.bleedBox.height * PX_PER_MM } : size,
    padding: active ? print.bleed * PX_PER_MM : 0,
  }
}

export function deckNotesPrint(notesPaper: PrintInput | undefined): Print {
  return parsePrint('notesPaper', notesPaper ?? NOTES_PAPER)
}

export function deckPressSettings(size: Deck['size'], options: DeckPressOptions): { sheet?: DeckSheetGeometry; notes: Print } {
  const sheet = deckSheetGeometry(size, options.sheet)
  const notes = deckNotesPrint(options.notesPaper)
  if (options.sheet && options.imposition) {
    throw new RangeError('sheet and imposition cannot be combined. Remove sheet, or remove imposition, to clear this refusal.')
  }
  if (options.sheet && options.layout === 'notes') {
    throw new RangeError("sheet and layout: 'notes' cannot be combined. Remove sheet, or use notesPaper for notes press settings, to clear this refusal.")
  }
  const print = options.layout === 'notes' ? notes : sheet?.print
  if (print && usesPressLayout(print) && options.preferCssPageSize) {
    throw new RangeError(
      'A deck sheet with bleed or marks takes its size from its print setting. Remove preferCssPageSize, or remove the bleed and marks, to clear this refusal.',
    )
  }
  return { sheet, notes }
}
