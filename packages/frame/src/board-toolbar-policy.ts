export type ToolbarNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'

export function toolbarNextIndex(enabled: readonly boolean[], current: number, key: ToolbarNavigationKey, rtl: boolean): number {
  const available = enabled.flatMap((value, index) => (value ? [index] : []))
  if (available.length === 0) return -1
  if (key === 'Home') return available[0] ?? -1
  if (key === 'End') return available.at(-1) ?? -1
  const position = available.indexOf(current)
  const start = position < 0 ? 0 : position
  const forward = key === 'ArrowRight' ? !rtl : rtl
  return available[(start + (forward ? 1 : available.length - 1)) % available.length] ?? -1
}
