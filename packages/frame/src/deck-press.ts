import { type Deck, type MarkColor, Print, type PrintInput, PX_PER_MM } from '@segnavia/format'

export interface DeckSheetPrint {
  bleed?: number
  safe?: number
  marks?: boolean
  markColor?: MarkColor
}

export function deckSheetPrint(size: Deck['size'], sheet: DeckSheetPrint | undefined, setting = 'sheet'): Print | undefined {
  if (!sheet) return undefined
  const width = size.width / PX_PER_MM
  const height = size.height / PX_PER_MM
  const result = Print.safeParse({
    paper: { width: Math.min(width, height), height: Math.max(width, height), unit: 'mm' },
    orientation: width > height ? 'landscape' : 'portrait',
    ...sheet,
  })
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue?.path.at(-1) ?? setting
  throw new RangeError(
    `The ${setting} setting is invalid: ${String(field)} ${issue?.message ?? 'is invalid'}. Correct ${setting}.${String(field)}, or remove ${setting}, to clear this refusal.`,
  )
}

export function deckNotesPrint(notesPaper: PrintInput | undefined): Print {
  const result = Print.safeParse(notesPaper ?? { paper: 'letter' })
  if (result.success) return result.data
  const issue = result.error.issues[0]
  const field = issue?.path.at(-1) ?? 'notesPaper'
  throw new RangeError(
    `The notesPaper setting is invalid: ${String(field)} ${issue?.message ?? 'is invalid'}. Correct notesPaper.${String(field)}, or remove notesPaper, to clear this refusal.`,
  )
}
