import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES } from '../architecture.ts'
import { ENTRIES_END, ENTRIES_START, entryRows, entryTable, type PackageExports } from './checks/readme.ts'

const ROOT = path.resolve(import.meta.dir, '..')

for (const [packageName, rule] of Object.entries(PACKAGES)) {
  const directory = path.join(ROOT, 'packages', packageName)
  const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as {
    name: string
    exports: PackageExports
  }
  const readmePath = path.join(directory, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const start = readme.indexOf(ENTRIES_START)
  const end = readme.indexOf(ENTRIES_END)
  if (start === -1 || end === -1 || end < start) throw new Error(`${manifest.name} README is missing its entry markers.`)
  const table = entryTable(entryRows(manifest.name, manifest.exports, rule))
  const updated = `${readme.slice(0, start + ENTRIES_START.length)}\n${table}\n${readme.slice(end)}`
  if (updated !== readme) writeFileSync(readmePath, updated)
}
