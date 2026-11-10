import type { PaginateVariable, TextVariable } from '@segnavia/format'
import type { PaginateUnit } from './paginate-types.ts'

export interface PaginateVariableValues {
  start: string
  first: string
  last: string
}

export function pageSetPoints(placed: PaginateUnit[]): Record<string, Array<PaginateVariable & { firstLine: boolean }>> {
  const setOnPage = Object.create(null) as Record<string, Array<PaginateVariable & { firstLine: boolean }>>
  const firstUnit = placed[0]
  for (const unit of placed) {
    for (const setPoint of unit.block.variables ?? []) {
      if (setPoint.line !== unit.index) continue
      const values = setOnPage[setPoint.name] ?? []
      values.push({ ...setPoint, firstLine: unit === firstUnit })
      setOnPage[setPoint.name] = values
    }
  }
  return setOnPage
}

export function paginateVariables(
  placed: PaginateUnit[],
  carried: Record<string, Pick<PaginateVariable, 'value' | 'scope'>>,
  declarations: readonly TextVariable[],
): { values: Record<string, PaginateVariableValues>; carried: Record<string, Pick<PaginateVariable, 'value' | 'scope'>> } {
  const setOnPage = pageSetPoints(placed)
  const values = Object.create(null) as Record<string, PaginateVariableValues>
  const next = Object.assign(Object.create(null), carried) as Record<string, Pick<PaginateVariable, 'value' | 'scope'>>
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

export function resolveVariablesAcrossPages<Page extends { blank: boolean; flow: string }>(
  pages: readonly Page[],
  unitsForPage: (page: Page) => PaginateUnit[],
  declarations: readonly TextVariable[],
): Array<Record<string, string>> {
  let carried = Object.create(null) as Record<string, Pick<PaginateVariable, 'value' | 'scope'>>
  let previousFlow: string | undefined
  return pages.map((page) => {
    if (page.flow !== previousFlow) {
      carried = Object.assign(Object.create(null), Object.fromEntries(Object.entries(carried).filter(([, value]) => value.scope !== 'flow'))) as Record<
        string,
        Pick<PaginateVariable, 'value' | 'scope'>
      >
    }
    previousFlow = page.flow
    if (page.blank) return {}
    const resolved = paginateVariables(unitsForPage(page), carried, declarations)
    carried = resolved.carried
    return Object.fromEntries(
      declarations.flatMap((declaration) => {
        const value = resolved.values[declaration.name]?.[declaration.pick]
        return value ? [[declaration.name, value]] : []
      }),
    )
  })
}
