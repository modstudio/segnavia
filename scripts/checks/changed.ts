import type { PackageRule } from '../../architecture.ts'

export interface ChangedSelection {
  packages: string[]
  scripts: boolean
  packageChecks: boolean
}

export function selectChangedTests(files: string[], packages: Record<string, PackageRule>): ChangedSelection {
  const selected = new Set<string>()
  for (const file of files) {
    const match = /^packages\/([^/]+)\//.exec(file)
    if (match?.[1] && packages[match[1]]) selected.add(match[1])
  }

  let added = true
  while (added) {
    added = false
    for (const [name, rule] of Object.entries(packages)) {
      if (selected.has(name)) continue
      if (rule.imports.some((dependency) => dependency.startsWith('@segnavia/') && selected.has(dependency.slice('@segnavia/'.length)))) {
        selected.add(name)
        added = true
      }
    }
  }

  return {
    packages: Object.keys(packages).filter((name) => selected.has(name)),
    scripts: files.some((file) => file === 'architecture.ts' || file.startsWith('scripts/')),
    packageChecks: files.some((file) => file === 'scripts/publish.ts' || file === 'package.json' || file.endsWith('/package.json')),
  }
}
