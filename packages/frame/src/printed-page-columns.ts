export interface PrintedPageRect {
  left: number
  right: number
}

export interface FragmentSpan {
  start: number
  end: number
}

export function fragmentSpan(rect: PrintedPageRect, box: PrintedPageRect, direction: 'ltr' | 'rtl'): FragmentSpan {
  const start = direction === 'rtl' ? box.right - rect.right : rect.left - box.left
  return { start, end: start + (rect.right - rect.left) }
}

export function columnOf(span: FragmentSpan, textWidth: number): number {
  return Math.max(0, Math.floor((span.start + span.end) / 2 / textWidth))
}

export function paperCount(spans: FragmentSpan[], textWidth: number): number {
  return spans.reduce((count, span) => Math.max(count, columnOf(span, textWidth) + 1), 1)
}
