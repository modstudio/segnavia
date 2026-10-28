export function spreadSlots(pageCount: number): number {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) return 0
  return pageCount + 1
}

export function pageScale(frameInline: number, paperInline: number, columns: number): number {
  if (![frameInline, paperInline, columns].every(Number.isFinite) || frameInline <= 0 || paperInline <= 0 || columns <= 0) return 0
  return Math.min(1, frameInline / (paperInline * columns))
}
