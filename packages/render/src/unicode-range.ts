export type UnicodeRangeParse = { ok: true; value: string } | { ok: false; reason: string }

const MAX_CODE_POINT = 0x10ffff
const MAX_CODE_POINT_HEX = MAX_CODE_POINT.toString(16).toUpperCase()
const DESCRIPTOR_FORM = 'U+hex, U+hex-hex, or U+hex with ? wildcards'
export const UNICODE_RANGE_CLEARANCE = `${DESCRIPTOR_FORM}; code points at most ${MAX_CODE_POINT_HEX}`

function codePoint(hex: string): number {
  return Number.parseInt(hex, 16)
}

function aboveMax(hex: string, token: string): UnicodeRangeParse | undefined {
  if (codePoint(hex) > MAX_CODE_POINT) return { ok: false, reason: `${token} has a code point above ${MAX_CODE_POINT_HEX}` }
}

function malformed(token: string): UnicodeRangeParse {
  return { ok: false, reason: `${token} is not a CSS unicode-range descriptor (${UNICODE_RANGE_CLEARANCE})` }
}

function parseRange(token: string): UnicodeRangeParse | undefined {
  const match = /^[Uu]\+([0-9A-Fa-f]{1,6})-([0-9A-Fa-f]{1,6})$/.exec(token)
  if (!match) return
  const start = match[1] ?? ''
  const end = match[2] ?? ''
  const high = aboveMax(start, token) ?? aboveMax(end, token)
  if (high) return high
  if (codePoint(start) > codePoint(end)) return { ok: false, reason: `${token} has start greater than end` }
  return { ok: true, value: `U+${start.toUpperCase()}-${end.toUpperCase()}` }
}

function parseWildcard(token: string): UnicodeRangeParse | undefined {
  const match = /^[Uu]\+([0-9A-Fa-f]{0,5})(\?+)$/.exec(token)
  if (!match) return
  const hex = match[1] ?? ''
  const marks = match[2] ?? ''
  if (hex.length + marks.length > 6) return malformed(token)
  const high = aboveMax(`${hex}${'0'.repeat(marks.length)}`, token) ?? aboveMax(`${hex}${'F'.repeat(marks.length)}`, token)
  if (high) return high
  return { ok: true, value: `U+${hex.toUpperCase()}${marks}` }
}

function parseSingle(token: string): UnicodeRangeParse | undefined {
  const match = /^[Uu]\+([0-9A-Fa-f]{1,6})$/.exec(token)
  if (!match) return
  const hex = match[1] ?? ''
  const high = aboveMax(hex, token)
  if (high) return high
  return { ok: true, value: `U+${hex.toUpperCase()}` }
}

function parseDescriptor(token: string): UnicodeRangeParse {
  return parseRange(token) ?? parseWildcard(token) ?? parseSingle(token) ?? malformed(token)
}

export function parseUnicodeRange(range: string): UnicodeRangeParse {
  if (range.trim() === '') return { ok: false, reason: 'the list is empty' }
  const tokens = range.split(',').map((part) => part.trim())
  if (tokens.some((token) => token.length === 0)) return { ok: false, reason: 'the list has an empty entry' }
  const parsed: string[] = []
  for (const token of tokens) {
    const result = parseDescriptor(token)
    if (!result.ok) return result
    parsed.push(result.value)
  }
  return { ok: true, value: parsed.join(', ') }
}
