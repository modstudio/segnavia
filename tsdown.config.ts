import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'
import { bunSource, PACKAGES, platformForRuntime, SOURCE_CONDITION, type SourceExport } from './architecture.ts'

interface ExportConditions {
  [SOURCE_CONDITION]: SourceExport
  default: string
}

interface PackageManifest {
  bin?: string | Record<string, string>
  exports: Record<string, ExportConditions>
}

interface PackageBuild {
  binOutputs: Set<string>
  entries: Record<string, string>
}

function packageBuild(name: string): PackageBuild {
  const file = path.join(import.meta.dirname, 'packages', name, 'package.json')
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as PackageManifest
  const result: Record<string, string> = {}
  for (const conditions of Object.values(manifest.exports)) {
    const source = bunSource(conditions[SOURCE_CONDITION])
    if (!source) throw new Error(`${file} has an export without the ${SOURCE_CONDITION} condition.`)
    if (conditions.default.startsWith('./dist/browser/')) continue
    const output = conditions.default.replace(/^\.\/dist\//, '').replace(/\.js$/, '')
    result[output] = source.replace(/^\.\//, '')
  }
  const targets = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {})
  const binOutputs = new Set<string>()
  for (const target of targets) {
    const match = /^\.\/dist\/(.+)\.js$/.exec(target)
    if (!match) throw new Error(`${file} has a bin target outside ./dist/*.js: ${target}`)
    const output = match[1] as string
    result[output] = `src/cli/${output}.ts`
    binOutputs.add(`${output}.js`)
  }
  return { entries: result, binOutputs }
}

export default defineConfig(
  Object.entries(PACKAGES).map(([name, rule]): UserConfig => {
    const build = packageBuild(name)
    return {
      name,
      cwd: path.join(import.meta.dirname, 'packages', name),
      entry: build.entries,
      platform: platformForRuntime(rule.runtime),
      format: 'esm',
      fixedExtension: false,
      dts: true,
      unbundle: true,
      root: 'src',
      banner: build.binOutputs.size > 0 ? ({ fileName }) => (build.binOutputs.has(fileName) ? '#!/usr/bin/env node' : undefined) : undefined,
      deps: { neverBundle: true, dts: { neverBundle: true } },
      exports: false,
    }
  }),
)
