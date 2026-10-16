import type { Page as Tab } from 'playwright-core'
import type { OverflowContribution, OverflowEntry, OverflowPart } from './options.ts'

/**
 * Chromium's measured maximum print shrink; the 3x overflow demo check fails
 * if it changes. Chromium measures against the scaled page width, so using
 * this cap for any end overflow makes its capped shrink cancel the scale.
 */
export const CHROMIUM_MAX_SHRINK = 1.5

export function counterScale(endOverflow: number): number {
  return endOverflow > 0 ? CHROMIUM_MAX_SHRINK : 1
}

export async function measureOverflow(tab: Tab, pageWidth: number, part: OverflowPart, inputIndex?: number): Promise<OverflowEntry> {
  const measured = await tab.evaluate((width) => {
    const root = document.documentElement
    const extent = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)
    const contributions: OverflowContribution[] = []
    let clippedStart = 0
    let clippedEnd = 0
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
      const elementStart = Math.max(0, -box.left)
      const elementEnd = Math.max(0, box.right - width)
      clippedStart = Math.max(clippedStart, elementStart)
      clippedEnd = Math.max(clippedEnd, elementEnd)
      if ((elementStart > 0 || elementEnd > 0) && contributions.length < 20) {
        contributions.push({ locator: locator(element), clippedStart: elementStart, clippedEnd: elementEnd })
      }
    }
    return {
      pageWidth: width,
      extent,
      clippedStart,
      clippedEnd,
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
): Promise<{ bytes: Uint8Array; overflow: OverflowEntry }> {
  const overflow = await measureOverflow(tab, pageWidth, part, inputIndex)
  return { bytes: await tab.pdf({ ...pdf, scale: counterScale(overflow.clippedEnd) }), overflow }
}
