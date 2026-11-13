export interface FontCoverageDeclaration {
  weight?: number | readonly [number, number]
  style?: 'normal' | 'italic'
  unicodeRange?: string
}

export interface FontCoverageFace {
  weight?: number | string | readonly [number, number]
  style?: string
  unicodeRange?: string
}

export interface FontCoverageGap {
  weight: number | [number, number]
  style?: 'normal' | 'italic'
  unicodeRange?: string
}

/**
 * Its source text is embedded in frames by declaredFontLoadExpression, so this function must remain self-contained.
 * An unreadable declaration fails closed as one gap over its whole declared region.
 */
export function fontCoverageGaps(declaration: FontCoverageDeclaration, faces: readonly FontCoverageFace[]): FontCoverageGap[] {
  type Range = [number, number]
  const fullRange: Range = [0, 0x10ffff]
  const parseRange = (raw: string): Range | null => {
    const match = /^\s*U\+([\dA-F?]{1,6})(?:-([\dA-F]{1,6}))?\s*$/i.exec(raw)
    const source = match?.[1]
    if (!source || (source.includes('?') && match?.[2] !== undefined)) return null
    const start = Number.parseInt(source.replace(/\?/g, '0'), 16)
    const end = Number.parseInt(match?.[2] ?? source.replace(/\?/g, 'F'), 16)
    return start <= end && end <= fullRange[1] ? [start, end] : null
  }
  const weightRange = (weight: FontCoverageDeclaration['weight'] | FontCoverageFace['weight']): Range | null => {
    const checked = (start: number, end: number): Range | null =>
      Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end <= 1000 && start <= end ? [start, end] : null
    if (weight === undefined || weight === 'normal') return [400, 400]
    if (weight === 'bold') return [700, 700]
    if (typeof weight === 'number') return checked(weight, weight)
    if (Array.isArray(weight)) return checked(weight[0], weight[1])
    const match = /^([1-9]\d{0,2}|1000)(?: ([1-9]\d{0,2}|1000))?$/.exec(weight as string)
    return match?.[1] ? checked(Number(match[1]), Number(match[2] ?? match[1])) : null
  }
  const ranges = (value: string | undefined): Range[] | null => {
    if (value === undefined) return [fullRange]
    const parsed: Range[] = []
    for (const raw of value.split(',')) {
      const range = parseRange(raw)
      if (range === null) return null
      parsed.push(range)
    }
    parsed.sort((left, right) => left[0] - right[0] || left[1] - right[1])
    const merged: Range[] = []
    for (const range of parsed) {
      const previous = merged[merged.length - 1]
      if (previous && range[0] <= previous[1] + 1) previous[1] = Math.max(previous[1], range[1])
      else merged.push([...range])
    }
    return merged.length > 0 ? merged : null
  }
  const subtract = (source: readonly Range[], covered: readonly Range[]): Range[] => {
    let remaining = source.map((range): Range => [...range])
    for (const cover of covered) {
      const next: Range[] = []
      for (const range of remaining) {
        if (cover[1] < range[0] || cover[0] > range[1]) {
          next.push(range)
          continue
        }
        if (cover[0] > range[0]) next.push([range[0], cover[0] - 1])
        if (cover[1] < range[1]) next.push([cover[1] + 1, range[1]])
      }
      remaining = next
    }
    return remaining
  }
  const formatRanges = (value: readonly Range[]): string => {
    const point = (codePoint: number) => codePoint.toString(16).toUpperCase().padStart(4, '0')
    return value.map(([start, end]) => (start === end ? `U+${point(start)}` : `U+${point(start)}-${point(end)}`)).join(',')
  }
  const unreadableGap = (weight: Range | null, parsedRanges: Range[] | null): FontCoverageGap => {
    const gapWeight: FontCoverageGap['weight'] = weight === null ? [1, 1000] : weight[0] === weight[1] ? weight[0] : weight
    const unicodeRange = declaration.unicodeRange === undefined ? undefined : parsedRanges === null ? declaration.unicodeRange : formatRanges(parsedRanges)
    return {
      weight: gapWeight,
      ...(declaration.style === undefined ? {} : { style: declaration.style }),
      ...(unicodeRange === undefined ? {} : { unicodeRange }),
    }
  }

  const declaredWeight = weightRange(declaration.weight)
  const declaredRanges = ranges(declaration.unicodeRange)
  if (declaredWeight === null || declaredRanges === null) return [unreadableGap(declaredWeight, declaredRanges)]
  const candidates = faces.flatMap((face) => {
    const faceWeight = weightRange(face.weight)
    const faceRanges = ranges(face.unicodeRange)
    return faceWeight !== null && faceRanges !== null && (face.style ?? 'normal') === (declaration.style ?? 'normal')
      ? [{ weight: faceWeight, ranges: faceRanges }]
      : []
  })
  const boundaries = new Set([declaredWeight[0], declaredWeight[1] + 1])
  for (const candidate of candidates) {
    const start = Math.max(declaredWeight[0], candidate.weight[0])
    const end = Math.min(declaredWeight[1], candidate.weight[1])
    if (start <= end) {
      boundaries.add(start)
      boundaries.add(end + 1)
    }
  }
  const cuts = [...boundaries].sort((left, right) => left - right)
  const slices: Array<{ weight: Range; ranges: Range[] }> = []
  for (let index = 0; index < cuts.length - 1; index++) {
    const weight: Range = [cuts[index] as number, (cuts[index + 1] as number) - 1]
    const covered = candidates.flatMap((candidate) => (candidate.weight[0] <= weight[0] && candidate.weight[1] >= weight[1] ? candidate.ranges : []))
    const uncovered = subtract(declaredRanges, covered)
    if (uncovered.length === 0) continue
    const previous = slices[slices.length - 1]
    if (previous && previous.weight[1] + 1 === weight[0] && formatRanges(previous.ranges) === formatRanges(uncovered)) previous.weight[1] = weight[1]
    else slices.push({ weight, ranges: uncovered })
  }
  return slices.map(({ weight, ranges: uncovered }) => ({
    weight: weight[0] === weight[1] ? weight[0] : weight,
    ...(declaration.style === undefined ? {} : { style: declaration.style }),
    ...(declaration.unicodeRange === undefined && uncovered.length === 1 && uncovered[0]?.[0] === 0 && uncovered[0]?.[1] === fullRange[1]
      ? {}
      : { unicodeRange: formatRanges(uncovered) }),
  }))
}
