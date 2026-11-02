import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { bunSource, PACKAGES, platformForRuntime, SOURCE_CONDITION, type SourceExport } from './architecture.ts'

interface ExportConditions {
  [SOURCE_CONDITION]: SourceExport
  default: string
}

const file = path.join(import.meta.dirname, 'packages/frame/package.json')
const diagramEntry = path.join(import.meta.dirname, 'packages/frame/src/diagrams.ts')
const diagramModule = readFileSync(path.join(import.meta.dirname, 'packages/frame/dist/diagrams.js'), 'utf8')
const diagramExport = 'export const diagramScript='
const diagramOffset = diagramModule.indexOf(diagramExport)
if (diagramOffset < 0) throw new Error('The built diagram entry does not export diagramScript.')
const diagramPayload = diagramModule.slice(diagramOffset)
const manifest = JSON.parse(readFileSync(file, 'utf8')) as { exports: Record<string, ExportConditions> }
const entries: Record<string, string> = {}
for (const conditions of Object.values(manifest.exports)) {
  const source = bunSource(conditions[SOURCE_CONDITION])
  if (!source) throw new Error(`${file} has an export without the ${SOURCE_CONDITION} condition.`)
  if (!conditions.default.startsWith('./dist/browser/')) continue
  const output = conditions.default.replace(/^\.\/dist\/browser\//, '').replace(/\.js$/, '')
  entries[output] = source.replace(/^\.\//, '')
}

export default defineConfig(
  Object.entries(entries).map(([name, entry]) => ({
    name: `frame browser ${name}`,
    cwd: path.join(import.meta.dirname, 'packages/frame'),
    entry: { [name]: entry },
    outDir: 'dist/browser',
    clean: false,
    platform: platformForRuntime(PACKAGES.frame?.runtime ?? 'universal'),
    format: 'esm' as const,
    dts: false,
    minify: true,
    deps: { alwaysBundle: /.*/, onlyBundle: false },
    plugins: [
      {
        name: 'browser-diagram-payload',
        load(id) {
          if (id === diagramEntry) return diagramPayload
        },
      },
    ],
  })),
)
