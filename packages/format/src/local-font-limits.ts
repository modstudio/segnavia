export interface LocalFontLimits {
  count?: number
  bytes?: number
}

export interface LocalFontLimitFace {
  family: string
  bytes: number
}

// Sixty-four faces cover several declared families with a full set of cuts;
// decoded bytes remain the effective bound on the transported font data.
export const LOCAL_FONT_LIMITS = { count: 64, bytes: 32 * 1024 * 1024 } as const

function limit(value: number | undefined, fallback: number, label: string): number | string {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < 0) {
    return `The local font ${label} limit must be a non-negative safe integer; pass valid limits to clear this refusal.`
  }
  return resolved
}

export function localFontLimitRefusal(faces: readonly LocalFontLimitFace[], limits: LocalFontLimits = {}): string | undefined {
  const countLimit = limit(limits.count, LOCAL_FONT_LIMITS.count, 'count')
  if (typeof countLimit === 'string') return countLimit
  const byteLimit = limit(limits.bytes, LOCAL_FONT_LIMITS.bytes, 'byte')
  if (typeof byteLimit === 'string') return byteLimit
  if (faces.length > countLimit) {
    return `The local face ${JSON.stringify(faces[countLimit]?.family ?? 'unknown family')} exceeds the count limit of ${countLimit}; pass higher limits or declare fewer local font families to clear this refusal.`
  }
  let bytes = 0
  for (const face of faces) {
    bytes += face.bytes
    if (bytes > byteLimit) {
      return `The local face ${JSON.stringify(face.family)} exceeds the byte limit of ${byteLimit}; pass higher limits or declare fewer local font families to clear this refusal.`
    }
  }
}
