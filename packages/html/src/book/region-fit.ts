import { PX_PER_MM, PX_PER_PT } from '@segnavia/format'

export const ABSOLUTE_PX: Record<string, number> = {
  cm: 10 * PX_PER_MM,
  in: 72 * PX_PER_PT,
  mm: PX_PER_MM,
  pc: 12 * PX_PER_PT,
  pt: PX_PER_PT,
  px: 1,
  q: PX_PER_MM / 4,
}

export function parseCssLength(value: string): { value: number; unit: string } | undefined {
  const held = value.trim().replace(/\s*!important\s*$/i, '')
  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]+)$/i.exec(held)
  const amount = match?.[1]
  const unit = match?.[2]
  if (amount === undefined || unit === undefined) return undefined
  return { value: Number(amount), unit: unit.toLowerCase() }
}

export function lengthPx(value: string, table: Record<string, number>): number | undefined {
  const parsed = parseCssLength(value)
  if (parsed === undefined || !(parsed.value > 0)) return undefined
  const factor = table[parsed.unit]
  return factor === undefined ? undefined : parsed.value * factor
}

function fitExample(attribute: string): string {
  return attribute === 'data-fit-min' ? '48pt' : '1pt'
}

function fitLengthIssues(template: string, region: string, attribute: string, value: string): string[] {
  const example = fitExample(attribute)
  const parsed = parseCssLength(value)
  if (parsed === undefined) {
    return [
      `template "${template}" region "${region}" ${attribute} "${value}" is not an absolute CSS length; use an absolute CSS length such as ${example} to clear this refusal`,
    ]
  }
  if (ABSOLUTE_PX[parsed.unit] === undefined) {
    return [
      `template "${template}" region "${region}" ${attribute} "${value}" uses unit "${parsed.unit}"; use an absolute CSS length (px, pt, pc, in, cm, mm or q) such as ${example} to clear this refusal`,
    ]
  }
  if (!(parsed.value > 0)) {
    return [
      `template "${template}" region "${region}" ${attribute} "${value}" is not a positive absolute CSS length; use a positive absolute CSS length such as ${example} to clear this refusal`,
    ]
  }
  return []
}

function regionFitIssues(template: string, region: string, attribs: Record<string, string>): string[] {
  const minText = attribs['data-fit-min']
  const stepText = attribs['data-fit-step']
  if (minText === undefined && stepText === undefined) return []
  const issues: string[] = []
  if (minText !== undefined) issues.push(...fitLengthIssues(template, region, 'data-fit-min', minText))
  if (minText !== undefined || stepText !== undefined) issues.push(...fitLengthIssues(template, region, 'data-fit-step', stepText ?? ''))
  return issues
}

export function templateRegionFitIssues(template: string, regions: { attribs: Record<string, string> }[]): string[] {
  return regions.flatMap((node) => {
    const region = node.attribs['data-region']
    return region ? regionFitIssues(template, region, node.attribs) : []
  })
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
