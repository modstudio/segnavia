import type { Page as Tab } from 'playwright-core'
import type { OverflowContribution, OverflowEntry, OverflowPart } from './options.ts'

export type BookOverflowPart = Extract<OverflowPart, 'front' | 'body' | 'margin'>

export type PrintResult<Required extends boolean = false> = {
  bytes: Uint8Array
} & (Required extends true ? { overflow: OverflowEntry } : { overflow?: OverflowEntry })

/**
 * Chromium's measured maximum print shrink; the 3x overflow demo check fails
 * if it changes. Chromium lays a scaled print out at the narrower width P / s,
 * then shrinks it by at most this factor. The solved scale searches layout
 * widths for the point where rightward content reaches P, and uses this exact
 * cap when it is already reached at the narrowest layout. Rightward generated
 * content in an RTL root is a known limit: neither scroll extent nor element
 * boxes expose it.
 */
export const CHROMIUM_MAX_SHRINK = 1.5

export type ScaleMeasurement = Readonly<{ layoutWidth: number; contentWidth: number }>

export type ScaleDecision = Readonly<{ scale: number } | { measure: number }>

/** Decides the next layout to measure, or the print scale, from measured widths. */
export function solveScale(pageWidth: number, measurements: readonly ScaleMeasurement[]): ScaleDecision {
  const measured = new Map(measurements.map((measurement) => [measurement.layoutWidth, measurement.contentWidth]))
  const atPage = measured.get(pageWidth)
  if (atPage === undefined) return { measure: pageWidth }
  if (atPage <= pageWidth) return { scale: 1 }

  const narrowest = Math.ceil(pageWidth / CHROMIUM_MAX_SHRINK)
  const atNarrowest = measured.get(narrowest)
  if (atNarrowest === undefined) return { measure: narrowest }
  if (atNarrowest >= pageWidth) return { scale: CHROMIUM_MAX_SHRINK }

  let low = narrowest
  let high = pageWidth
  let lastSatisfied = pageWidth
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    const width = measured.get(middle)
    if (width === undefined) return { measure: middle }
    if (width >= pageWidth) {
      high = middle
      lastSatisfied = middle
    } else {
      low = middle
    }
  }
  const layoutWidth = measured.get(high) !== undefined && (measured.get(high) as number) >= pageWidth ? high : lastSatisfied
  return { scale: pageWidth / layoutWidth }
}

interface MeasuredOverflow {
  overflow: Omit<OverflowEntry, 'part' | 'inputIndex' | 'scale'>
  rightOverflow: number
}

export interface HorizontalBox {
  left: number
  right: number
}

/** Returns the visible horizontal part of a box after ancestor clipping. */
export function clippedHorizontalBox(box: HorizontalBox, clips: readonly HorizontalBox[]): HorizontalBox | undefined {
  const visible = clips.reduce(
    (current, clip) => ({ left: Math.max(current.left, clip.left), right: Math.min(current.right, clip.right) }),
    box,
  )
  return visible.right > visible.left ? visible : undefined
}

async function measuredOverflow(tab: Tab, pageWidth: number): Promise<MeasuredOverflow> {
  const measured = await tab.evaluate((width) => {
    const root = document.documentElement
    const extent = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)
    const endOverflow = Math.max(0, extent - root.clientWidth)
    const rtl = getComputedStyle(root).direction === 'rtl'
    const clipsContent = (style: CSSStyleDeclaration) => {
      const contain = style.contain.split(/\s+/)
      return (
        style.overflowX !== 'visible' ||
        contain.includes('paint') ||
        contain.includes('strict') ||
        contain.includes('content') ||
        style.clipPath !== 'none' ||
        style.clip !== 'auto'
      )
    }
    const extentClipped = [root, document.body].some((element) => element && clipsContent(getComputedStyle(element)))
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
    const clipBox = (element: Element, style: CSSStyleDeclaration): HorizontalBox => {
      const box = element.getBoundingClientRect()
      const scale = element instanceof HTMLElement && element.offsetWidth > 0 ? box.width / element.offsetWidth : 1
      let left = box.left + element.clientLeft * scale
      let right = left + element.clientWidth * scale
      const legacy = style.clip.match(/^rect\((?:([^, ]+)[, ]+)(?:([^, ]+)[, ]+)(?:([^, ]+)[, ]+)([^, )]+)\)$/)
      if (legacy) {
        const length = (value: string | undefined, fallback: number) => (value && value !== 'auto' ? Number.parseFloat(value) * scale : fallback)
        left = box.left + length(legacy[4], 0)
        right = box.left + length(legacy[2], box.width)
      }
      return { left, right }
    }
    const elements = [...document.querySelectorAll('*')].map((element) => {
      const box = element.getBoundingClientRect()
      const clips: HorizontalBox[] = []
      let ancestor = element.parentElement
      while (ancestor) {
        const style = getComputedStyle(ancestor)
        if (clipsContent(style)) clips.push(clipBox(ancestor, style))
        ancestor = ancestor.parentElement
      }
      return { locator: locator(element), box: { left: box.left, right: box.right }, clips }
    })
    return { extent, endOverflow, extentClipped, rtl, elements }
  }, pageWidth)
  const contributions: OverflowContribution[] = []
  let clippedStart = 0
  let clippedEnd = measured.endOverflow
  let rightOverflow = measured.rtl || measured.extentClipped ? 0 : measured.endOverflow
  for (const element of measured.elements) {
    const rawEnd = Math.max(0, measured.rtl ? -element.box.left : element.box.right - pageWidth)
    clippedEnd = Math.max(clippedEnd, rawEnd)
    const box = clippedHorizontalBox(element.box, element.clips)
    if (!box) continue
    const elementStart = Math.max(0, measured.rtl ? box.right - pageWidth : -box.left)
    const elementEnd = Math.max(0, measured.rtl ? -box.left : box.right - pageWidth)
    clippedStart = Math.max(clippedStart, elementStart)
    rightOverflow = Math.max(rightOverflow, box.right - pageWidth)
    if ((elementStart > 0 || elementEnd > 0) && contributions.length < 20) {
      contributions.push({ locator: element.locator, clippedStart: elementStart, clippedEnd: elementEnd })
    }
  }
  return {
    overflow: {
      pageWidth,
      extent: measured.extent,
      clippedStart,
      clippedEnd,
      elements: contributions,
    },
    rightOverflow,
  }
}

function overflowEntry(measured: MeasuredOverflow, scale: number, part: OverflowPart, inputIndex?: number): OverflowEntry {
  return { part, ...(inputIndex === undefined ? {} : { inputIndex }), ...measured.overflow, scale }
}

export async function measureOverflow(tab: Tab, pageWidth: number, part: OverflowPart, inputIndex?: number): Promise<OverflowEntry> {
  await tab.emulateMedia({ media: 'print' })
  return overflowEntry(await measuredOverflow(tab, pageWidth), 1, part, inputIndex)
}

export async function printWithOverflow(
  tab: Tab,
  pageWidth: number,
  part: OverflowPart,
  pdf: Parameters<Tab['pdf']>[0],
  inputIndex?: number,
): Promise<PrintResult<true>> {
  await tab.emulateMedia({ media: 'print' })
  const viewport = tab.viewportSize()
  if (!viewport) throw new Error('The print tab has no viewport.')
  const measurements: ScaleMeasurement[] = []
  let original: MeasuredOverflow | undefined
  let decision: ScaleDecision = solveScale(pageWidth, measurements)
  while ('measure' in decision) {
    await tab.setViewportSize({ width: decision.measure, height: viewport.height })
    const measured = await measuredOverflow(tab, decision.measure)
    if (decision.measure === pageWidth) original = measured
    measurements.push({ layoutWidth: decision.measure, contentWidth: decision.measure + measured.rightOverflow })
    decision = solveScale(pageWidth, measurements)
  }
  await tab.setViewportSize(viewport)
  if (!original) throw new Error('The page-width overflow measurement was not made.')
  return {
    bytes: await tab.pdf({ ...pdf, scale: decision.scale }),
    overflow: overflowEntry(original, decision.scale, part, inputIndex),
  }
}
