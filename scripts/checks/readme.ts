import { bunSource, entryRuntime, entrySpecifier, type PackageRule, SOURCE_CONDITION, type SourceExport } from '../../architecture.ts'

export interface EntryRow {
  entry: string
  runtime: PackageRule['runtime'] | 'types only'
}

type ExportConditions = Partial<Record<typeof SOURCE_CONDITION, SourceExport>> & Record<string, unknown>

export type PackageExports = Record<string, ExportConditions>

export const ENTRIES_START = '<!-- segnavia:entries -->'
export const ENTRIES_END = '<!-- /segnavia:entries -->'

export interface EntriesRegion {
  start: number
  end: number
}

export function entriesRegion(readme: string): EntriesRegion | undefined {
  const marker = readme.indexOf(ENTRIES_START)
  if (marker === -1) return undefined
  const start = marker + ENTRIES_START.length
  const end = readme.indexOf(ENTRIES_END, start)
  return end === -1 ? undefined : { start, end }
}

export function missingSourceCondition(exports: PackageExports): string | undefined {
  return Object.entries(exports).find(([, conditions]) => conditions[SOURCE_CONDITION] === undefined)?.[0]
}

export function sourceConditionRefusal(name: string, subpath: string): string {
  return `${name} export ${subpath} has no ${SOURCE_CONDITION} condition; add it to clear this refusal.`
}

export function entryRows(name: string, exports: PackageExports, rule: PackageRule): EntryRow[] {
  return Object.entries(exports).map(([subpath, conditions]) => {
    const sourceExport = conditions[SOURCE_CONDITION]
    if (sourceExport === undefined) throw new Error(sourceConditionRefusal(name, subpath))
    const source = bunSource(sourceExport).replace(/^\.\//, '')
    const packageName = name.replace(/^@segnavia\//, '')
    return {
      entry: entrySpecifier(name, subpath),
      runtime: entryRuntime(packageName, subpath, rule, source),
    }
  })
}

export function entryRow({ entry, runtime }: EntryRow): string {
  return `| \`${entry}\` | ${runtime} |`
}

export function entryTable(rows: EntryRow[]): string {
  return ['| Entry point | Runtime |', '|---|---|', ...rows.map(entryRow)].join('\n')
}

export function firstDifferingEntry(actual: string, expected: EntryRow[]): string {
  const actualLines = actual.split('\n')
  const expectedLines = entryTable(expected).split('\n')
  const expectedRows = expected.map(entryRow)
  for (let index = 0; index < expectedRows.length; index++) {
    const formatted = expectedRows[index] as string
    if (!actualLines.includes(formatted)) return expected[index]?.entry ?? JSON.stringify(formatted.trim())
  }
  const unexpected = actualLines.find((line) => !expectedLines.includes(line))
  if (unexpected !== undefined) return JSON.stringify(unexpected.trim())
  const index = actualLines.findIndex((line, lineIndex) => line !== expectedLines[lineIndex])
  return index >= 2 ? (expected[index - 2]?.entry ?? JSON.stringify((actualLines[index] ?? '').trim())) : JSON.stringify((actualLines[index] ?? '').trim())
}

export function withEntryTable(readme: string, table: string): string | undefined {
  const region = entriesRegion(readme)
  if (!region) return undefined
  return `${readme.slice(0, region.start)}\n${table}\n${readme.slice(region.end)}`
}
