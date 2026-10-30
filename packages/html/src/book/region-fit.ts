import type { BookTemplate } from '@segnavia/format'
import { elements, parse } from '../sanitize.ts'

const LENGTH = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(px|pt|pc|in|cm|mm|q|em|rem|ex|ch|vw|vh|vmin|vmax|cap|ic|lh|rlh)$/i
const UNITLESS_ZERO = /^[+-]?0(?:\.0+)?$/
const ABSOLUTE_PT: Record<string, number> = {
  cm: 72 / 2.54,
  in: 72,
  mm: 72 / 25.4,
  pc: 12,
  pt: 1,
  px: 72 / 96,
  q: 72 / 101.6,
}

export function parseCssLength(value: string): { value: number; unit: string } | undefined {
  const held = value.trim().replace(/\s*!important\s*$/i, '')
  if (UNITLESS_ZERO.test(held)) return { value: 0, unit: 'px' }
  const match = LENGTH.exec(held)
  const amount = match?.[1]
  const unit = match?.[2]
  if (amount === undefined || unit === undefined) return undefined
  return { value: Number(amount), unit: unit.toLowerCase() }
}

function declaration(style: string, property: string): string | undefined {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match?.[1]?.trim()
}

export function authoredFontSize(style: string | undefined): string | undefined {
  if (!style) return undefined
  const size = declaration(style, 'font-size')
  if (size) return size
  const font = declaration(style, 'font')
  if (!font) return undefined
  const match = /(?:^|\s)([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:px|pt|pc|in|cm|mm|q|em|rem|ex|ch|%))\s*(?:\/|$)/i.exec(` ${font}`)
  return match?.[1]
}

function toPt(length: { value: number; unit: string }): number | undefined {
  const factor = ABSOLUTE_PT[length.unit]
  return factor === undefined ? undefined : length.value * factor
}

function greater(min: { value: number; unit: string }, authored: { value: number; unit: string }): boolean {
  const minPt = toPt(min)
  const authoredPt = toPt(authored)
  if (minPt !== undefined && authoredPt !== undefined) return minPt > authoredPt + 1e-9
  return min.unit === authored.unit && min.value > authored.value + 1e-9
}

function lengthIssue(template: string, region: string, attribute: string, value: string, positive: boolean): string {
  const need = positive ? 'a positive CSS length' : 'a CSS length'
  const example = attribute === 'data-fit-min' ? '48pt' : '1pt'
  return `template "${template}" region "${region}" ${attribute} "${value}" is not ${need}; use ${need} such as ${example} to clear this refusal`
}

function regionFitIssues(template: string, region: string, attribs: Record<string, string>): string[] {
  const minText = attribs['data-fit-min']
  const stepText = attribs['data-fit-step']
  if (minText === undefined && stepText === undefined) return []
  const issues: string[] = []
  const min = minText === undefined ? undefined : parseCssLength(minText)
  if (minText !== undefined && min === undefined) issues.push(lengthIssue(template, region, 'data-fit-min', minText, false))
  if (minText !== undefined || stepText !== undefined) {
    const step = stepText === undefined ? undefined : parseCssLength(stepText)
    if (stepText === undefined || step === undefined || !(step.value > 0)) {
      issues.push(lengthIssue(template, region, 'data-fit-step', stepText ?? '', true))
    }
  }
  if (min === undefined) return issues
  const authoredText = authoredFontSize(attribs.style)
  const authored = authoredText === undefined ? undefined : parseCssLength(authoredText)
  if (authored !== undefined && greater(min, authored)) {
    issues.push(
      `template "${template}" region "${region}" data-fit-min "${minText}" is above the authored font size ${authoredText}; lower the minimum or raise the region's font-size to clear this refusal`,
    )
  }
  return issues
}

export function templateRegionFitIssues(templates: BookTemplate[]): string[] {
  return templates.flatMap((template) =>
    elements(parse(template.html).children).flatMap((node) => {
      const region = node.attribs['data-region']
      return region ? regionFitIssues(template.name, region, node.attribs) : []
    }),
  )
}

export function fitRegionSize(max: number, min: number, step: number, overflows: (size: number) => boolean): { overflow: boolean; size: number } {
  function sizeAt(index: number): number {
    return max - index * step
  }
  if (!(max >= min) || !(step > 0) || !Number.isFinite(max) || !Number.isFinite(min) || !Number.isFinite(step)) {
    return { size: max, overflow: overflows(max) }
  }
  const last = Math.floor((max - min) / step + 1e-9)
  if (!Number.isSafeInteger(last) || last < 0) {
    if (!overflows(max)) return { size: max, overflow: false }
    return { size: min, overflow: overflows(min) }
  }
  let low = 0
  let high = last
  let fitted = last + 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (overflows(sizeAt(mid))) low = mid + 1
    else {
      fitted = mid
      high = mid - 1
    }
  }
  if (fitted > last) return { size: sizeAt(last), overflow: true }
  return { size: sizeAt(fitted), overflow: false }
}
