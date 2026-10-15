import { z } from 'zod'

export const NumberSystem = z.enum(['arabic', 'roman-lower', 'roman-upper', 'hebrew'])
export type NumberSystem = z.infer<typeof NumberSystem>

export const NoteMarker = z.union([NumberSystem, z.literal('symbols')])
export type NoteMarker = z.infer<typeof NoteMarker>

const ROMAN_DIGITS = [
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

const HEBREW_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'] as const
const HEBREW_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'] as const
const NOTE_SYMBOLS = ['*', '†', '‡', '§'] as const

function positiveInteger(value: number): void {
  if (!Number.isInteger(value) || value < 1) throw new RangeError(`value ${value} must be a positive integer`)
}

function inRange(value: number, maximum: number, system: NumberSystem): void {
  if (value > maximum) throw new RangeError(`${system} value ${value} is outside the range 1 to ${maximum}`)
}

function roman(value: number): string {
  let remaining = value
  let result = ''
  for (const [amount, digit] of ROMAN_DIGITS) {
    while (remaining >= amount) {
      result += digit
      remaining -= amount
    }
  }
  return result
}

function hebrewBelowThousand(value: number): string {
  const hundreds = 'ת'.repeat(Math.floor(value / 400))
  const underFourHundred = value % 400
  const hundredsLetter = ['', 'ק', 'ר', 'ש'][Math.floor(underFourHundred / 100)]
  const remainder = underFourHundred % 100
  if (remainder === 15) return `${hundreds}${hundredsLetter}טו`
  if (remainder === 16) return `${hundreds}${hundredsLetter}טז`
  return `${hundreds}${hundredsLetter}${HEBREW_TENS[Math.floor(remainder / 10)]}${HEBREW_ONES[remainder % 10]}`
}

function hebrew(value: number): string {
  const thousands = Math.floor(value / 1000)
  const rest = value % 1000
  return `${thousands === 0 ? '' : `${HEBREW_ONES[thousands]}׳`}${hebrewBelowThousand(rest)}`
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

export function noteMarker(index: number, marker: NoteMarker): string {
  positiveInteger(index)
  if (marker !== 'symbols') return formatNumber(index, marker)
  const symbol = NOTE_SYMBOLS[(index - 1) % NOTE_SYMBOLS.length] as (typeof NOTE_SYMBOLS)[number]
  return symbol.repeat(Math.ceil(index / NOTE_SYMBOLS.length))
}
