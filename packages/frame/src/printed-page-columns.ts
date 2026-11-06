export interface PrintedPageRect {
  left: number
  right: number
}

export interface FragmentSpan {
  start: number
  end: number
}

export interface FragmentColumns {
  first: number
  last: number
}

export function fragmentSpan(rect: PrintedPageRect, box: PrintedPageRect, direction: 'ltr' | 'rtl'): FragmentSpan {
  const start = direction === 'rtl' ? box.right - rect.right : rect.left - box.left
  return { start, end: start + (rect.right - rect.left) }
}

// Overflow past a column still paints in following paper windows, so counting
// reaches the last column painted while ID ownership stays where the fragment begins.
export function fragmentColumns(span: FragmentSpan, textWidth: number): FragmentColumns {
  const first = Math.max(0, Math.floor((span.start + 1) / textWidth))
  return { first, last: Math.max(first, Math.floor((span.end - 1) / textWidth)) }
}

export function paperCount(spans: FragmentSpan[], textWidth: number): number {
  return spans.reduce((count, span) => Math.max(count, fragmentColumns(span, textWidth).last + 1), 1)
}
