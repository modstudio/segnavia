export interface FitInputs {
  width: number
  height: number
  paddingInlineStart: number
  paddingInlineEnd: number
  reserveBlockStart: number
  reserveBlockEnd: number
  sheetWidth: number
  sheetHeight: number
}

export interface FittedSize {
  scale: number
  width: number
  height: number
}

export function fitSheet(input: FitInputs): FittedSize {
  const availableWidth = Math.max(0, input.width - input.paddingInlineStart - input.paddingInlineEnd)
  const availableHeight = input.height - input.reserveBlockStart - input.reserveBlockEnd
  const byWidth = availableWidth / input.sheetWidth
  const byHeight = availableHeight > 0 ? availableHeight / input.sheetHeight : byWidth
  const scale = Math.max(0, Math.min(byWidth, byHeight))
  return { scale, width: input.sheetWidth * scale, height: input.sheetHeight * scale }
}
