import type { PackageRule } from '../../architecture.ts'

export interface ChangedSelection {
  packages: string[]
  scripts: boolean
  packageChecks: boolean
}

function addDependents(selected: Set<string>, packages: Record<string, PackageRule>): void {
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
}

export function selectChangedTests(files: string[], packages: Record<string, PackageRule>): ChangedSelection {
  const selected = new Set<string>()
  let scripts = false
  for (const file of files) {
    if (file.endsWith('.md') || file.startsWith('docs/')) continue
    const match = /^packages\/([^/]+)\//.exec(file)
    if (match?.[1] && packages[match[1]]) {
      selected.add(match[1])
      continue
    }
    if (file === 'architecture.ts' || file.startsWith('scripts/')) {
      scripts = true
      continue
    }
    // Unclassified repository inputs can affect any test, so select the conservative full set.
    for (const name of Object.keys(packages)) selected.add(name)
    scripts = true
  }

  addDependents(selected, packages)

  return {
    packages: Object.keys(packages).filter((name) => selected.has(name)),
    scripts: scripts || selected.size > 0,
    packageChecks: files.some((file) => file === 'scripts/publish.ts' || file === 'package.json' || file.endsWith('/package.json')),
  }
}
