import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES } from '../architecture.ts'
import { entriesRegion, entryRows, entryTable, missingSourceCondition, type PackageExports, sourceConditionRefusal, withEntryTable } from './checks/readme.ts'

const ROOT = path.resolve(import.meta.dir, '..')

for (const [packageName, rule] of Object.entries(PACKAGES)) {
  const directory = path.join(ROOT, 'packages', packageName)
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
    name: string
    exports: PackageExports
  }
  const readmePath = path.join(directory, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  if (!entriesRegion(readme)) throw new Error(`${manifest.name} README is missing its entry markers.`)
  const missing = missingSourceCondition(manifest.exports)
  if (missing) {
    console.error(sourceConditionRefusal(manifest.name, missing))
    continue
  }
  const table = entryTable(entryRows(manifest.name, manifest.exports, rule))
  const updated = withEntryTable(readme, table)
  if (updated === undefined) throw new Error(`${manifest.name} README is missing its entry markers.`)
  if (updated !== readme) writeFileSync(readmePath, updated)
}
