import { z } from 'zod'

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
  .object({
    symbols: z.array(NoteMark).min(1, 'a note symbol sequence must have at least one entry'),
  })
  .superRefine(({ symbols }, ctx) => {
    const seen = new Set<string>()
    symbols.forEach((symbol, index) => {
      if (seen.has(symbol))
        ctx.addIssue({ code: 'custom', path: ['symbols', index], message: `note symbol ${symbol} is duplicated; every entry must be distinct` })
      seen.add(symbol)
    })
  })

export const NoteMarker = z.union([NumberSystem, z.literal('symbols'), NoteSymbols, z.object({ mark: NoteMark })])
export type NoteMarker = z.infer<typeof NoteMarker>

export const DEFAULT_NOTE_SYMBOLS = ['*', '§', '‖', '¶'] as const

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
  const functions = [positiveInteger, inRange, roman, hebrewBelowThousand, hebrew, formatNumber]
  return `${functions.map((fn) => fn.toString()).join('\n')}\nvar formatNumber=${formatNumber.name};`
}

export function noteMarker(index: number, marker: NoteMarker): string {
  positiveInteger(index)
  if (typeof marker === 'string' && marker !== 'symbols') return formatNumber(index, marker)
  if (typeof marker === 'object' && 'mark' in marker) return marker.mark
  const symbols = marker === 'symbols' ? DEFAULT_NOTE_SYMBOLS : marker.symbols
  const symbol = symbols[(index - 1) % symbols.length]
  if (symbol === undefined) throw new Error('a note symbol sequence must have at least one entry')
  return symbol.repeat(Math.ceil(index / symbols.length))
}

export function noteMarkerEntries(marker: NoteMarker): readonly string[] | undefined {
  if (marker === 'symbols') return DEFAULT_NOTE_SYMBOLS
  if (typeof marker === 'object') return 'mark' in marker ? [marker.mark] : marker.symbols
  return undefined
}

export function noteMarkerDescription(marker: NoteMarker): string {
  const entries = noteMarkerEntries(marker)
  if (!entries) return marker as NumberSystem
  return typeof marker === 'object' && 'mark' in marker ? `mark ${marker.mark}` : `symbols ${entries.join(' ')}`
}
