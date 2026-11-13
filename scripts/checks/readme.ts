import { bunSource, type PackageRule, type SourceExport } from '../../architecture.ts'

export interface EntryRow {
  entry: string
  runtime: PackageRule['runtime']
}

export type PackageExports = Record<string, { '@segnavia/source': SourceExport }>

export const ENTRIES_START = '<!-- segnavia:entries -->'
export const ENTRIES_END = '<!-- /segnavia:entries -->'

export function entryRows(name: string, exports: PackageExports, rule: PackageRule): EntryRow[] {
  return Object.entries(exports).map(([subpath, conditions]) => {
    const source = bunSource(conditions['@segnavia/source']).replace(/^\.\//, '')
    const runtime = rule.runtime === 'browser' && rule.serverSafe?.includes(source) ? 'universal' : rule.runtime
    return {
      entry: subpath === '.' ? name : `${name}${subpath.slice(1)}`,
      runtime,
    }
  })
}

export function entryTable(rows: EntryRow[]): string {
  return ['| Entry point | Runtime |', '|---|---|', ...rows.map(({ entry, runtime }) => `| \`${entry}\` | ${runtime} |`)].join('\n')
}

export function firstDifferingEntry(actual: string, expected: EntryRow[]): string {
  const lines = actual.split('\n')
  const actualRows = lines
    .map((line) => /^\| `([^`]+)` \| (?:browser|server|universal) \|$/.exec(line)?.[1])
    .filter((entry): entry is string => entry !== undefined)
  const length = Math.max(actualRows.length, expected.length)
  for (let index = 0; index < length; index++) {
    const expectedEntry = expected[index]?.entry
    if (actualRows[index] !== expectedEntry) return expectedEntry ?? actualRows[index] ?? '(entry table)'
    const expectedLine = `| \`${expectedEntry}\` | ${expected[index]?.runtime} |`
    if (!lines.includes(expectedLine)) return expectedEntry ?? '(entry table)'
  }
  return '(entry table)'
}
