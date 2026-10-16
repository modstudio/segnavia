import type { Page as Tab } from 'playwright-core'
import type { OverflowContribution, OverflowEntry, OverflowPart } from './options.ts'

export type BookOverflowPart = Extract<OverflowPart, 'front' | 'body' | 'margin'>

export type PrintResult<Required extends boolean = false> = {
  bytes: Uint8Array
} & (Required extends true ? { overflow: OverflowEntry } : { overflow?: OverflowEntry })

/**
 * Chromium's measured maximum print shrink; the 3x overflow demo check fails
 * if it changes. On the pinned build Chromium shrinks only for rightward
 * overflow in a left-to-right root. It measures against the scaled page width,
 * so using this cap makes its capped shrink cancel the scale.
 */
export const CHROMIUM_MAX_SHRINK = 1.5

export function counterScale(direction: 'ltr' | 'rtl', endOverflow: number): number {
  return direction === 'ltr' && endOverflow > 0 ? CHROMIUM_MAX_SHRINK : 1
}

export async function measureOverflow(tab: Tab, pageWidth: number, part: OverflowPart, inputIndex?: number): Promise<OverflowEntry> {
  await tab.emulateMedia({ media: 'print' })
  const measured = await tab.evaluate((width) => {
    const root = document.documentElement
    const extent = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)
    const endOverflow = Math.max(0, extent - root.clientWidth)
    const rtl = getComputedStyle(root).direction === 'rtl'
    const contributions: OverflowContribution[] = []
    let clippedStart = 0
    const locator = (element: Element) => {
      if (element.id) return `#${CSS.escape(element.id)}`
      const parts: string[] = []
      let current: Element | null = element
      while (current && current !== root && parts.length < 3) {
        const classes = [...current.classList]
          .slice(0, 2)
          .map((name) => `.${CSS.escape(name)}`)
          .join('')
        parts.unshift(`${current.localName}${classes}`)
        current = current.parentElement
      }
      return parts.join(' > ')
    }
    for (const element of document.querySelectorAll('*')) {
      const box = element.getBoundingClientRect()
      const elementStart = Math.max(0, rtl ? box.right - width : -box.left)
      const elementEnd = Math.max(0, rtl ? -box.left : box.right - width)
      clippedStart = Math.max(clippedStart, elementStart)
      if ((elementStart > 0 || elementEnd > 0) && contributions.length < 20) {
        contributions.push({ locator: locator(element), clippedStart: elementStart, clippedEnd: elementEnd })
      }
    }
    return {
      pageWidth: width,
      extent,
      clippedStart,
      clippedEnd: endOverflow,
      elements: contributions,
    }
  }, pageWidth)
  return { part, ...(inputIndex === undefined ? {} : { inputIndex }), ...measured }
}

export async function printWithOverflow(
  tab: Tab,
  pageWidth: number,
  part: OverflowPart,
  pdf: Parameters<Tab['pdf']>[0],
  inputIndex?: number,
): Promise<PrintResult<true>> {
  const overflow = await measureOverflow(tab, pageWidth, part, inputIndex)
  const direction = await tab.evaluate(() => (getComputedStyle(document.documentElement).direction === 'rtl' ? 'rtl' : 'ltr'))
  return { bytes: await tab.pdf({ ...pdf, scale: counterScale(direction, overflow.clippedEnd) }), overflow }
}
