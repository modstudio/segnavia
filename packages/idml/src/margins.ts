import { type LogicalMargin, MM_PER_PT, type PhysicalMargin } from '@segnavia/format'
import type { Element } from 'domhandler'
import { numberAttribute } from './xml.ts'

export function readMargin(element: Element | undefined): PhysicalMargin {
  return {
    top: numberAttribute(element, 'Top', 0),
    bottom: numberAttribute(element, 'Bottom', 0),
    left: numberAttribute(element, 'Left', 0),
    right: numberAttribute(element, 'Right', 0),
  }
}

export function logicalMargin(margin: PhysicalMargin, side: 'left' | 'right'): LogicalMargin {
  return {
    blockStart: margin.top * MM_PER_PT,
    blockEnd: margin.bottom * MM_PER_PT,
    inlineStart: (side === 'left' ? margin.right : margin.left) * MM_PER_PT,
    inlineEnd: (side === 'left' ? margin.left : margin.right) * MM_PER_PT,
  }
}
