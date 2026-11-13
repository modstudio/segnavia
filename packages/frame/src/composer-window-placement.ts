export function correctedWindowSpacer(initial: number, galleyContentTop: number, placedContentTop: number): number {
  return initial + galleyContentTop - placedContentTop
}

export function windowSpacerProperties(offset: number): { paddingBlockStart: number; marginBlockEnd: number } {
  return { paddingBlockStart: Math.max(0, offset), marginBlockEnd: Math.min(0, offset) }
}

export function windowSpacerOffset(paddingBlockStart: number, marginBlockEnd: number): number {
  return paddingBlockStart + marginBlockEnd
}

export function windowContentTop(elementTop: number, flowOriginTop: number): number {
  return elementTop - flowOriginTop
}
