import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { PACKAGES, platformForRuntime, SOURCE_CONDITION } from './architecture.ts'

interface ExportConditions {
  [SOURCE_CONDITION]: string
  default: string
}

function entries(name: string): Record<string, string> {
  const file = path.join(import.meta.dirname, 'packages', name, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { exports: Record<string, ExportConditions> }
  const result: Record<string, string> = {}
  for (const conditions of Object.values(manifest.exports)) {
    const source = conditions[SOURCE_CONDITION]
    if (!source) throw new Error(`${file} has an export without the ${SOURCE_CONDITION} condition.`)
    if (conditions.default.startsWith('./dist/browser/')) continue
    const output = conditions.default.replace(/^\.\/dist\//, '').replace(/\.js$/, '')
    result[output] = source.replace(/^\.\//, '')
  }
  return result
}

export default defineConfig(
  Object.entries(PACKAGES).map(
    ([name, rule]): UserConfig => ({
      name,
      cwd: path.join(import.meta.dirname, 'packages', name),
      entry: entries(name),
      platform: platformForRuntime(rule.runtime),
      format: 'esm',
      fixedExtension: false,
      dts: true,
      unbundle: true,
      root: 'src',
      deps: { neverBundle: true, dts: { neverBundle: true } },
      exports: false,
    }),
  ),
)
