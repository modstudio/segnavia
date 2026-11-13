export function correctedWindowSpacer(initial: number, galleyContentTop: number, placedContentTop: number): number {
  return initial + galleyContentTop - placedContentTop
}
