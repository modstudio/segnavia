import type { ReportCollector } from './report.ts'
import type { IdmlTextVariable } from './types.ts'

const MATCH_CHARACTER_STYLE = 'MatchCharacterStyleType'

export function matchVariables(variables: IdmlTextVariable[], report: ReportCollector): IdmlTextVariable[] {
  const result: IdmlTextVariable[] = []
  const matchedStyles = new Set<string>()
  for (const variable of variables) {
    if (variable.type !== MATCH_CHARACTER_STYLE || !variable.appliedCharacterStyle) {
      report.add(report.unsupportedElements, `TextVariable:${variable.name}`, variable.location)
      continue
    }
    if (matchedStyles.has(variable.appliedCharacterStyle)) {
      report.add(report.unsupportedElements, `TextVariable duplicate style:${variable.name}`, variable.location)
      continue
    }
    matchedStyles.add(variable.appliedCharacterStyle)
    result.push(variable)
  }
  return result
}
