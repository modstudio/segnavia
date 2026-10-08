import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsdown'
import { PACKAGES, platformForRuntime, SOURCE_CONDITION } from './architecture.ts'

interface ExportConditions {
  [SOURCE_CONDITION]: string
  default: string
}

const file = path.join(import.meta.dirname, 'packages/frame/package.json')
const manifest = JSON.parse(readFileSync(file, 'utf8')) as { exports: Record<string, ExportConditions> }
const entries: Record<string, string> = {}
for (const conditions of Object.values(manifest.exports)) {
  const source = conditions[SOURCE_CONDITION]
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
  })),
)
