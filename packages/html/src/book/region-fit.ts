import { PX_PER_MM, PX_PER_PT } from '@segnavia/format'

export const ABSOLUTE_UNITS = ['px', 'pt', 'pc', 'in', 'cm', 'mm', 'q'] as const
type AbsoluteUnit = (typeof ABSOLUTE_UNITS)[number]

export const ABSOLUTE_PX: Record<AbsoluteUnit, number> = {
  px: 1,
  pt: PX_PER_PT,
  pc: 12 * PX_PER_PT,
  in: 72 * PX_PER_PT,
  cm: 10 * PX_PER_MM,
  mm: PX_PER_MM,
  q: PX_PER_MM / 4,
}

function listedAbsoluteUnits(): string {
  const last = ABSOLUTE_UNITS.length - 1
  return `${ABSOLUTE_UNITS.slice(0, last).join(', ')} or ${ABSOLUTE_UNITS[last]}`
}

function isAbsoluteUnit(unit: string): unit is AbsoluteUnit {
  return (ABSOLUTE_UNITS as readonly string[]).includes(unit)
}

export function parseCssLength(value: string): { value: number; unit: string } | undefined {
  const held = value.trim().replace(/\s*!important\s*$/i, '')
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]+)$/i.exec(held)
  const amount = match?.[1]
  const unit = match?.[2]
  if (amount === undefined || unit === undefined) return undefined
  return { value: Number(amount), unit: unit.toLowerCase() }
}

export function lengthPx(value: string, table: Readonly<Record<string, number>>): number | undefined {
  const parsed = parseCssLength(value)
  if (parsed === undefined || !(parsed.value > 0)) return undefined
  const factor = table[parsed.unit]
  return factor === undefined ? undefined : parsed.value * factor
}

function fitExample(attribute: string): string {
  return attribute === 'data-fit-min' ? '48pt' : '1pt'
}

function fitLengthIssues(where: string, attribute: string, value: string): string[] {
  const example = fitExample(attribute)
  const parsed = parseCssLength(value)
  if (parsed === undefined) {
    return [`${where} ${attribute} "${value}" is not an absolute CSS length; use an absolute CSS length such as ${example} to clear this refusal`]
  }
  if (!isAbsoluteUnit(parsed.unit)) {
    return [
      `${where} ${attribute} "${value}" uses unit "${parsed.unit}"; use an absolute CSS length (${listedAbsoluteUnits()}) such as ${example} to clear this refusal`,
    ]
  }
  if (!(parsed.value > 0)) {
    return [
      `${where} ${attribute} "${value}" is not a positive absolute CSS length; use a positive absolute CSS length such as ${example} to clear this refusal`,
    ]
  }
  return []
}

function regionFitIssues(where: string, attribs: Record<string, string>): string[] {
  const minText = attribs['data-fit-min']
  const stepText = attribs['data-fit-step']
  if (minText === undefined && stepText === undefined) return []
  const issues: string[] = []
  if (minText !== undefined) issues.push(...fitLengthIssues(where, 'data-fit-min', minText))
  if (minText !== undefined || stepText !== undefined) issues.push(...fitLengthIssues(where, 'data-fit-step', stepText ?? ''))
  return issues
}

export function namedRegionFitIssues(where: string, regions: { attribs: Record<string, string> }[]): string[] {
  return regions.flatMap((node) => {
    const region = node.attribs['data-region']
    return region ? regionFitIssues(`${where} region "${region}"`, node.attribs) : []
  })
}

export function templateRegionFitIssues(template: string, regions: { attribs: Record<string, string> }[]): string[] {
  return namedRegionFitIssues(`template "${template}"`, regions)
}

export function fitRegionSize(
  max: number,
  min: number,
  step: number,
  overflows: (size: number) => boolean,
): { overflow: boolean; size: number } | { usable: false } {
  function sizeAt(index: number): number {
    return max - index * step
  }
  if (!(max >= min) || !(step > 0) || !Number.isFinite(max) || !Number.isFinite(min) || !Number.isFinite(step)) {
    return { usable: false }
  }
  const last = Math.floor((max - min) / step + 1e-9)
  if (!Number.isSafeInteger(last)) {
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
