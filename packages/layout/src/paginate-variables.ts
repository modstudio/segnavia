import type { TextVariable } from '@segnavia/format'
import type { PaginateUnit } from './paginate-types.ts'

export interface CarriedVariable {
  value: string
  scope?: 'flow'
}

export interface PaginateVariableValues {
  start: string
  first: string
  last: string
}

interface PageSetPoint {
  value: string
  firstLine: boolean
  scope?: 'flow'
}

export function pageSetPoints(placed: PaginateUnit[]): Record<string, PageSetPoint[]> {
  const setOnPage = Object.create(null) as Record<string, PageSetPoint[]>
  const firstUnit = placed[0]
  for (const unit of placed) {
    for (const setPoint of unit.block.variables ?? []) {
      if (setPoint.line !== unit.index) continue
      const values = setOnPage[setPoint.name] ?? []
      values.push({ value: setPoint.value, firstLine: unit === firstUnit, ...(setPoint.scope === undefined ? {} : { scope: setPoint.scope }) })
      setOnPage[setPoint.name] = values
    }
  }
  return setOnPage
}

export function paginateVariables(
  placed: PaginateUnit[],
  carried: Record<string, CarriedVariable>,
  declarations: readonly TextVariable[],
): { values: Record<string, PaginateVariableValues>; carried: Record<string, CarriedVariable> } {
  const setOnPage = pageSetPoints(placed)
  const values = Object.create(null) as Record<string, PaginateVariableValues>
  const next = Object.assign(Object.create(null), carried) as Record<string, CarriedVariable>
  for (const declaration of declarations) {
    const onPage = setOnPage[declaration.name] ?? []
    const carriedValue = carried[declaration.name]?.value ?? ''
    const first = onPage[0]?.value ?? carriedValue
    const last = onPage.at(-1)?.value ?? carriedValue
    const firstLine = onPage.find((setPoint) => setPoint.firstLine)
    values[declaration.name] = { start: firstLine?.value ?? carriedValue, first, last }
    const final = onPage.at(-1)
    if (final) next[declaration.name] = { value: final.value, ...(final.scope === undefined ? {} : { scope: final.scope }) }
  }
  return { values, carried: next }
}
