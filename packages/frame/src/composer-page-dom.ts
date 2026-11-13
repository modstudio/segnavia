import { embedFunction } from '@segnavia/html'
import { logicalExtent, verticalWritingMode } from './composer-axis-policy.ts'

export function fillTemplateRegions(clone: HTMLElement, holder: HTMLElement): void {
  for (const fragment of Array.from(holder.querySelectorAll<HTMLElement>('[data-region]'))) {
    const name = fragment.getAttribute('data-region')
    if (!name) continue
    const target = Array.from(clone.querySelectorAll<HTMLElement>('[data-region]')).find((region) => region.getAttribute('data-region') === name)
    if (!target) continue
    target.replaceChildren(...Array.from(fragment.childNodes).map((child) => child.cloneNode(true)))
  }
}

export interface InkBounds {
  top: number
  right: number
  bottom: number
  left: number
}

export function inkBounds(element: HTMLElement, box: HTMLElement = element): InkBounds {
  const bounds = box.getBoundingClientRect()
  let top = bounds.top
  let right = bounds.right
  let bottom = bounds.bottom
  let left = bounds.left
  const include = (rect: DOMRect) => {
    if (rect.width === 0 && rect.height === 0) return
    top = Math.min(top, rect.top)
    right = Math.max(right, rect.right)
    bottom = Math.max(bottom, rect.bottom)
    left = Math.min(left, rect.left)
  }
  const range = document.createRange()
  range.selectNodeContents(element)
  if (!range.collapsed) include(range.getBoundingClientRect())
  for (const child of Array.from(element.querySelectorAll<HTMLElement>('*'))) include(child.getBoundingClientRect())
  if (element === box) {
    bottom = Math.max(bottom, bounds.top + box.scrollHeight)
    if (getComputedStyle(box).direction === 'rtl') left = Math.min(left, bounds.right - box.scrollWidth)
    else right = Math.max(right, bounds.left + box.scrollWidth)
  }
  return { top, right, bottom, left }
}

export function inkExcess(element: HTMLElement, box: HTMLElement = element): { block: number; inline: number } {
  const bounds = box.getBoundingClientRect()
  const ink = inkBounds(element, box)
  const block = Math.max(ink.bottom - bounds.bottom, bounds.top - ink.top)
  const inline = Math.max(ink.right - bounds.right, bounds.left - ink.left)
  return {
    block: logicalExtent({ width: inline, height: block }, getComputedStyle(box).writingMode, 'block'),
    inline: logicalExtent({ width: inline, height: block }, getComputedStyle(box).writingMode, 'inline'),
  }
}

export function embeddedInkFunctions(): string {
  return `${embedFunction('verticalWritingMode', verticalWritingMode)}
${embedFunction('logicalExtent', logicalExtent)}
${embedFunction('inkBounds', inkBounds)}
${embedFunction('inkExcess', inkExcess)}`
}
