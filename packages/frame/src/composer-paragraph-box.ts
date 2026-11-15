type InlineBoxStyle = Pick<
  CSSStyleDeclaration,
  | 'writingMode'
  | 'paddingLeft'
  | 'paddingRight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'borderLeftWidth'
  | 'borderRightWidth'
  | 'borderTopWidth'
  | 'borderBottomWidth'
>

/** Returns the usable inline size inside an element's padding and border. */
export function contentInlineSize(rect: { width: number; height: number }, style: InlineBoxStyle): number {
  const vertical = style.writingMode.startsWith('vertical')
  const start = Number.parseFloat(vertical ? style.paddingTop : style.paddingLeft) || 0
  const end = Number.parseFloat(vertical ? style.paddingBottom : style.paddingRight) || 0
  const startBorder = Number.parseFloat(vertical ? style.borderTopWidth : style.borderLeftWidth) || 0
  const endBorder = Number.parseFloat(vertical ? style.borderBottomWidth : style.borderRightWidth) || 0
  return Math.max(0, (vertical ? rect.height : rect.width) - start - end - startBorder - endBorder)
}
