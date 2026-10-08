export interface PackageDependencies {
  name: string
  dependencies: string[]
}

export interface PackedManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export type RegistryState = 'missing' | 'published'
export type ReleaseDecision = 'publish' | 'skip'

export function dependencyOrder(packages: PackageDependencies[]): string[] {
  const remaining = new Map(packages.map((item) => [item.name, new Set(item.dependencies)]))
  const ordered: string[] = []
  while (remaining.size > 0) {
    const ready = packages.filter((item) => remaining.has(item.name) && [...(remaining.get(item.name) ?? [])].every((name) => !remaining.has(name)))
    if (ready.length === 0) throw new Error('Could not establish package dependency order; the workspace dependencies contain a cycle.')
    for (const item of ready) {
      ordered.push(item.name)
      remaining.delete(item.name)
    }
  }
  return ordered
}

export function packedPackageRefusal(
  manifest: PackedManifest,
  sharedVersion: string,
  hasLicense: boolean,
  workspaceNames: ReadonlySet<string>,
): string | undefined {
  const dependencyKinds = [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies, manifest.peerDependencies]
  for (const dependencies of dependencyKinds) {
    for (const [name, range] of Object.entries(dependencies ?? {})) {
      if (range.startsWith('workspace:')) return `${manifest.name} still contains workspace: for ${name}. Pack it with Bun before publishing.`
      if (workspaceNames.has(name) && range !== sharedVersion)
        return `${manifest.name}@${manifest.version} depends on workspace package ${name} at ${range} instead of ${sharedVersion}. Run bun run version, or bun install, to refresh bun.lock.`
    }
  }
  if (manifest.version !== sharedVersion)
    return `${manifest.name}@${manifest.version} does not match ${sharedVersion}, the version shared by the other packages.`
  if (!hasLicense) return `${manifest.name}@${manifest.version} does not contain LICENSE.`
}

export function registryState(exitCode: number, stdout: string, stderr: string): RegistryState {
  if (exitCode === 0 && stdout.trim().length > 0) return 'published'
  if (exitCode === 0) return 'missing'
  if (exitCode !== 0 && /\bE404\b/.test(stderr)) return 'missing'
  const detail = (stderr || stdout).trim()
  throw new Error(`Could not reach the npm registry or establish whether the package exists.${detail ? ` ${detail}` : ''}`)
}

export function releaseDecision(state: RegistryState): ReleaseDecision {
  return state === 'published' ? 'skip' : 'publish'
}

export function publishedPackageRefusal(name: string, version: string, localIntegrity: string, registryIntegrity: string): string | undefined {
  if (localIntegrity !== registryIntegrity)
    return `${name}@${version} has local integrity ${localIntegrity} but npm has ${registryIntegrity}. Release a new version.`
}
