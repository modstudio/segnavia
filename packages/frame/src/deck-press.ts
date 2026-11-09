import {
  type Deck,
  deckTrim,
  PRESS_GEOMETRY_FIELDS,
  Print,
  type PrintBoxes,
  type PrintInput,
  PX_PER_MM,
  pressBoxes,
  printBoxes,
  usesPressLayout,
} from '@segnavia/format'
import { NOTES_PAPER } from './notes-layout.ts'

export interface DeckSheetGeometry {
  print: Print
  boxes: PrintBoxes
  active: boolean
  sheet: { width: number; height: number }
  padding: number
}

interface DeckPressOptions {
  sheet?: unknown
  notesPaper?: PrintInput
  layout?: 'slides' | 'notes'
  imposition?: unknown
  preferCssPageSize?: boolean
}

function invalidSetting(field: PropertyKey, message: string): RangeError {
  return new RangeError(
    `The notesPaper setting is invalid: ${String(field)} ${message}. Correct notesPaper.${String(field)}, or remove notesPaper, to clear this refusal.`,
  )
}

function parsePrint(input: PrintInput): Print {
  const result = Print.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw invalidSetting(issue?.path.at(-1) ?? 'notesPaper', issue?.message ?? 'is invalid')
}

export function deckSheetGeometry(deck: Deck): DeckSheetGeometry | undefined {
  if (!deck.print) return undefined
  const { size, print } = deck
  const { width, height } = deckTrim(size)
  const resolved = Print.parse({
    ...print,
    paper: { width: Math.min(width, height), height: Math.max(width, height), unit: 'mm' },
    orientation: width > height ? 'landscape' : 'portrait',
  })
  const boxes = pressBoxes({ width, height }, resolved)
  const active = usesPressLayout(resolved)
  return {
    print: resolved,
    boxes,
    active,
    sheet: active ? { width: boxes.bleedBox.width * PX_PER_MM, height: boxes.bleedBox.height * PX_PER_MM } : size,
    padding: active ? resolved.bleed * PX_PER_MM : 0,
  }
}

export function deckNotesPrint(notesPaper: PrintInput | undefined, deck: Deck): Print {
  const input = (notesPaper ?? NOTES_PAPER) as PrintInput & Record<string, unknown>
  for (const field of PRESS_GEOMETRY_FIELDS) {
    if (input[field] !== undefined) {
      throw new RangeError(`notesPaper.${field} belongs on the deck Document's print; remove notesPaper.${field} and set print.${field} to clear this refusal.`)
    }
  }
  return parsePrint({ ...input, ...deck.print })
}

export interface DeckPressSettings {
  sheet?: DeckSheetGeometry
  notes?: Print
  print?: Print
  boxes?: PrintBoxes
  active: boolean
  slides: boolean
}

export function deckPressSettings(deck: Deck, options: DeckPressOptions): DeckPressSettings {
  if (options.sheet !== undefined)
    throw new RangeError("PrintOptions.sheet was removed; put press geometry on the deck Document's print to clear this refusal.")
  const sheet = deckSheetGeometry(deck)
  const notes = options.layout === 'notes' ? deckNotesPrint(options.notesPaper, deck) : undefined
  const print = options.layout === 'notes' ? notes : sheet?.print
  const active = print ? usesPressLayout(print) : false
  if (active && options.preferCssPageSize) {
    throw new RangeError(
      "A deck with bleed or marks takes its size from the Document's print setting. Remove preferCssPageSize, or remove print.bleed and print.marks, to clear this refusal.",
    )
  }
  return {
    sheet,
    notes,
    print,
    boxes: options.layout === 'notes' && notes ? printBoxes(notes) : sheet?.boxes,
    active,
    slides: active && options.layout !== 'notes',
  }
}
