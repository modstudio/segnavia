import type { Page as Tab } from 'playwright-core'
import type { OverflowContribution, OverflowEntry, OverflowPart } from './options.ts'

export type BookOverflowPart = Extract<OverflowPart, 'front' | 'body' | 'margin'>

export type PrintResult<Required extends boolean = false> = {
  bytes: Uint8Array
} & (Required extends true ? { overflow: OverflowEntry } : { overflow?: OverflowEntry })

/**
 * Chromium's measured maximum print shrink; the 3x overflow demo check fails
 * if it changes. On the pinned build Chromium shrinks only for physical
 * rightward overflow. It measures against the scaled page width, so using this
 * cap makes its capped shrink cancel the scale. Rightward generated content in
 * an RTL root is a known limit: neither scroll extent nor element boxes expose it.
 */
export const CHROMIUM_MAX_SHRINK = 1.5

export function counterScale(rightOverflow: number): number {
  return rightOverflow > 0 ? CHROMIUM_MAX_SHRINK : 1
}

async function measuredOverflow(
  tab: Tab,
  pageWidth: number,
  part: OverflowPart,
  inputIndex?: number,
): Promise<{ overflow: OverflowEntry; rightOverflow: number }> {
  await tab.emulateMedia({ media: 'print' })
  const measured = await tab.evaluate((width) => {
    const root = document.documentElement
    const extent = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)
    const endOverflow = Math.max(0, extent - root.clientWidth)
    const rtl = getComputedStyle(root).direction === 'rtl'
    const contributions: OverflowContribution[] = []
    let clippedStart = 0
    let rightOverflow = rtl ? 0 : endOverflow
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
      rightOverflow = Math.max(rightOverflow, box.right - width)
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
      rightOverflow,
    }
  }, pageWidth)
  const { rightOverflow, ...entry } = measured
  return { overflow: { part, ...(inputIndex === undefined ? {} : { inputIndex }), ...entry }, rightOverflow }
}

export async function measureOverflow(tab: Tab, pageWidth: number, part: OverflowPart, inputIndex?: number): Promise<OverflowEntry> {
  return (await measuredOverflow(tab, pageWidth, part, inputIndex)).overflow
}

export async function printWithOverflow(
  tab: Tab,
  pageWidth: number,
  part: OverflowPart,
  pdf: Parameters<Tab['pdf']>[0],
  inputIndex?: number,
): Promise<PrintResult<true>> {
  const { overflow, rightOverflow } = await measuredOverflow(tab, pageWidth, part, inputIndex)
  return { bytes: await tab.pdf({ ...pdf, scale: counterScale(rightOverflow) }), overflow }
}
