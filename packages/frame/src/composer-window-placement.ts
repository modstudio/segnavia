export function correctedWindowSpacer(initial: number, galleyContentTop: number, placedContentTop: number): number {
  return Math.max(0, initial + galleyContentTop - placedContentTop)
}
