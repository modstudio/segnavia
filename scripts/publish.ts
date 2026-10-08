// Packs and publishes the six packages, safely resumable after a partial release.

import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES } from '../architecture.ts'
import { dependencyOrder, type PackedManifest, packedPackageRefusal, registryState, releaseDecision } from './publish-policy.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUTPUT = path.join(ROOT, 'out', 'release')
const dryRun = Bun.argv.slice(2).includes('--dry-run')
const offline = Bun.argv.slice(2).includes('--offline')
const unknown = Bun.argv.slice(2).filter((argument) => argument !== '--dry-run' && argument !== '--offline')

if (unknown.length > 0) throw new Error(`Unknown release option: ${unknown.join(', ')}`)
if (offline && !dryRun) throw new Error('--offline is only available with --dry-run; a real release must check the registry.')

interface WorkspacePackage {
  directory: string
  manifest: PackedManifest
}

interface PackedPackage {
  manifest: PackedManifest
  tarball: string
  size: number
  hasLicense: boolean
}

async function run(command: string[], cwd = ROOT): Promise<void> {
  const process = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if ((await process.exited) !== 0) throw new Error(`${command.join(' ')} failed.`)
}

async function output(command: string[], cwd = ROOT): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  return { exitCode, stdout, stderr }
}

function workspaces(): WorkspacePackage[] {
  return Object.keys(PACKAGES).map((name) => {
    const directory = path.join(ROOT, 'packages', name)
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')) as PackedManifest
    return { directory, manifest }
  })
}

async function inspectTarball(tarball: string): Promise<{ manifest: PackedManifest; hasLicense: boolean }> {
  const manifestResult = await output(['tar', '-xOf', tarball, 'package/package.json'])
  if (manifestResult.exitCode !== 0) throw new Error(`Could not read package/package.json from ${tarball}. ${manifestResult.stderr.trim()}`)
  const listResult = await output(['tar', '-tzf', tarball])
  if (listResult.exitCode !== 0) throw new Error(`Could not list ${tarball}. ${listResult.stderr.trim()}`)
  return {
    manifest: JSON.parse(manifestResult.stdout) as PackedManifest,
    hasLicense: listResult.stdout.split('\n').includes('package/LICENSE'),
  }
}

async function pack(workspace: WorkspacePackage): Promise<PackedPackage> {
  const filename = `${workspace.manifest.name.replace('@segnavia/', '')}-${workspace.manifest.version}.tgz`
  const tarball = path.join(OUTPUT, filename)
  const result = await output(['bun', 'pm', 'pack', '--filename', tarball, '--ignore-scripts'], workspace.directory)
  if (result.exitCode !== 0) throw new Error(`Could not pack ${workspace.manifest.name}. ${(result.stderr || result.stdout).trim()}`)
  const inspected = await inspectTarball(tarball)
  return { ...inspected, tarball, size: statSync(tarball).size }
}

const workspacePackages = workspaces()
const workspaceNames = new Set(workspacePackages.map(({ manifest }) => manifest.name))
const order = dependencyOrder(
  workspacePackages.map(({ manifest }) => ({
    name: manifest.name,
    dependencies: Object.keys(manifest.dependencies ?? {}).filter((name) => workspaceNames.has(name)),
  })),
)
const byName = new Map(workspacePackages.map((workspace) => [workspace.manifest.name, workspace]))

await run(['bun', 'run', 'build'])
rmSync(OUTPUT, { recursive: true, force: true })
mkdirSync(OUTPUT, { recursive: true })

const packed: PackedPackage[] = []
for (const name of order) {
  const workspace = byName.get(name)
  if (!workspace) throw new Error(`Could not find workspace ${name}.`)
  packed.push(await pack(workspace))
}

const sharedVersion = packed[0]?.manifest.version
if (!sharedVersion) throw new Error('No packages were found to release.')
for (const item of packed) {
  const refusal = packedPackageRefusal(item.manifest, sharedVersion, item.hasLicense)
  if (refusal) throw new Error(refusal)
}

for (const item of packed) {
  const lookup = offline ? undefined : await output(['npm', 'view', `${item.manifest.name}@${item.manifest.version}`, 'version', '--json'])
  const state = lookup ? registryState(lookup.exitCode, lookup.stdout, lookup.stderr) : 'missing'
  const decision = releaseDecision(state)
  console.log(
    `${item.manifest.name}@${item.manifest.version} ${item.size} bytes — ${decision === 'skip' ? 'skip (already published)' : dryRun ? 'would publish' : 'publish'}`,
  )
  if (decision === 'publish' && !dryRun) await run(['npm', 'publish', item.tarball, '--access', 'public'])
}
