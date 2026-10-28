import { MM_PER_PT, type ParentPageMargin } from '@segnavia/format'
import type { Element } from 'domhandler'
import type { IdmlMargin } from './types.ts'
import { numberAttribute } from './xml.ts'

export function readMargin(element: Element | undefined): IdmlMargin {
  return {
    top: numberAttribute(element, 'Top', 0),
    bottom: numberAttribute(element, 'Bottom', 0),
    left: numberAttribute(element, 'Left', 0),
    right: numberAttribute(element, 'Right', 0),
  }
}

export function logicalMargin(margin: IdmlMargin, side: 'left' | 'right'): ParentPageMargin {
  return {
    top: margin.top * MM_PER_PT,
    bottom: margin.bottom * MM_PER_PT,
    inner: (side === 'left' ? margin.right : margin.left) * MM_PER_PT,
    outer: (side === 'left' ? margin.left : margin.right) * MM_PER_PT,
  }
}
