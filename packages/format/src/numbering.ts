import { z } from 'zod'
import { primitiveRoot } from './repeated-mark.ts'

export const NumberSystem = z.enum(['arabic', 'roman-lower', 'roman-upper', 'hebrew'])
export type NumberSystem = z.infer<typeof NumberSystem>

export function isHebrew(lang: string | undefined): boolean {
  const primary = lang?.split('-')[0]?.toLowerCase()
  return primary === 'he' || primary === 'iw'
}

export function defaultPageNumbering(lang: string | undefined): NumberSystem {
  return isHebrew(lang) ? 'hebrew' : 'arabic'
}

/** A book's division number systems: each configured system, or the language's default for that division. */
export function divisionNumbering(
  lang: string | undefined,
  configured: { frontMatter?: NumberSystem; body?: NumberSystem } = {},
): { frontMatter: NumberSystem; body: NumberSystem } {
  const hebrew = isHebrew(lang)
  return { frontMatter: configured.frontMatter ?? (hebrew ? 'arabic' : 'roman-lower'), body: configured.body ?? defaultPageNumbering(lang) }
}

const NoteMark = z.string().regex(/^\S{1,8}$/u, 'a note mark must be 1 to 8 characters with no whitespace')

const NoteSymbols = z
  .strictObject(
    {
      symbols: z.array(NoteMark).min(1, 'a note symbol sequence must have at least one entry'),
    },
    'a note marker object must supply one of symbols or mark',
  )
  .superRefine(({ symbols }, ctx) => {
    const roots = new Map<string, string>()
    symbols.forEach((symbol, index) => {
      const root = primitiveRoot(symbol)
      const earlier = roots.get(root)
      if (earlier) {
        ctx.addIssue({
          code: 'custom',
          path: ['symbols', index],
          message: `note symbols ${earlier} and ${symbol} print the same repeated mark; supply entries with different primitive roots`,
        })
      } else roots.set(root, symbol)
    })
  })

const FixedNoteMark = z.strictObject({ mark: NoteMark }, 'a note marker object must supply one of symbols or mark')

export const NoteMarker = z.union([NumberSystem, z.literal('symbols'), NoteSymbols, FixedNoteMark])
export type NoteMarker = z.infer<typeof NoteMarker>

const DEFAULT_NOTE_SYMBOLS = ['*', '§', '‖', '¶'] as const

export type NoteMarkerSource =
  | { kind: 'number'; system: NumberSystem }
  | { kind: 'sequence'; entries: readonly [string, ...string[]] }
  | { kind: 'fixed'; mark: string }

export function noteMarkerSource(marker: NoteMarker): NoteMarkerSource {
  if (marker === 'symbols') return { kind: 'sequence', entries: DEFAULT_NOTE_SYMBOLS }
  if (typeof marker === 'string') return { kind: 'number', system: marker }
  if ('symbols' in marker) return { kind: 'sequence', entries: marker.symbols as [string, ...string[]] }
  return { kind: 'fixed', mark: marker.mark }
}

function positiveInteger(value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`value ${value} must be a positive integer`)
}

function inRange(value: number, maximum: number, system: NumberSystem): void {
  if (value > maximum) throw new RangeError(`${system} value ${value} is outside the range 1 to ${maximum}`)
}

function roman(value: number): string {
  const digits = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const
  let remaining = value
  let result = ''
  for (const [amount, digit] of digits) {
    while (remaining >= amount) {
      result += digit
      remaining -= amount
    }
  }
  return result
}

function hebrewBelowThousand(value: number): string {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'] as const
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'] as const
  const hundreds = 'ת'.repeat(Math.floor(value / 400))
  const underFourHundred = value % 400
  const hundredsLetter = ['', 'ק', 'ר', 'ש'][Math.floor(underFourHundred / 100)]
  const remainder = underFourHundred % 100
  if (remainder === 15) return `${hundreds}${hundredsLetter}טו`
  if (remainder === 16) return `${hundreds}${hundredsLetter}טז`
  return `${hundreds}${hundredsLetter}${tens[Math.floor(remainder / 10)]}${ones[remainder % 10]}`
}

function punctuatedHebrew(letters: string): string {
  return letters.length === 1 ? `${letters}׳` : `${letters.slice(0, -1)}״${letters.slice(-1)}`
}

export function formatHebrewNumeral(value: number, omitThousands = false): string {
  positiveInteger(value)
  if (!omitThousands) inRange(value, 9999, 'hebrew')
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  const heldThousands = omitThousands || thousands === 0 ? '' : `${hebrewBelowThousand(thousands)}׳`
  if (omitThousands && rest === 0) return `${hebrewBelowThousand(thousands)}׳`
  return `${heldThousands}${rest === 0 ? '' : punctuatedHebrew(hebrewBelowThousand(rest))}`
}

function hebrew(value: number): string {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'] as const
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  return `${thousands === 0 ? '' : `${ones[thousands]}׳`}${hebrewBelowThousand(rest)}`
}

export function formatNumber(value: number, system: NumberSystem): string {
  positiveInteger(value)
  if (system === 'arabic') return String(value)
  if (system === 'hebrew') {
    inRange(value, 9999, system)
    return hebrew(value)
  }
  inRange(value, 3999, system)
  const result = roman(value)
  return system === 'roman-lower' ? result.toLowerCase() : result
}

export function numberingScript(): string {
  const functions = [isHebrew, positiveInteger, inRange, roman, hebrewBelowThousand, punctuatedHebrew, formatHebrewNumeral, hebrew, formatNumber]
  return `${functions.map((fn) => fn.toString()).join('\n')}\nvar formatNumber=${formatNumber.name};`
}

export function noteMarker(index: number, marker: NoteMarker): string {
  positiveInteger(index)
  const source = noteMarkerSource(marker)
  switch (source.kind) {
    case 'number':
      return formatNumber(index, source.system)
    case 'fixed':
      return source.mark
    case 'sequence': {
      const symbol = source.entries[(index - 1) % source.entries.length] ?? source.entries[0]
      return symbol.repeat(Math.ceil(index / source.entries.length))
    }
  }
}
