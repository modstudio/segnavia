// Packs and publishes every package, safely resumable after a partial release.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACKAGES } from '../architecture.ts'
import {
  dependencyOrder,
  githubReleaseActions,
  type PackedManifest,
  packedPackageRefusal,
  publishedPackageRefusal,
  type ReleaseDecision,
  registryState,
  releaseDecision,
} from './publish-policy.ts'
import { releaseNotes } from './release-notes.ts'

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
  integrity: string
}

interface ReleasePlan {
  package: PackedPackage
  decision: ReleaseDecision
}

async function run(command: string[], cwd = ROOT, inheritStdin = false): Promise<void> {
  const process = Bun.spawn(command, { cwd, stdout: 'inherit', stderr: 'inherit', ...(inheritStdin ? { stdin: 'inherit' as const } : {}) })
  if ((await process.exited) !== 0) throw new Error(`${command.join(' ')} failed.`)
}

async function output(command: string[], cwd = ROOT): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(command, { cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  return { exitCode, stdout, stderr }
}

function failureDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function requireGitHubAccess(): Promise<void> {
  let result: Awaited<ReturnType<typeof output>>
  try {
    result = await output(['gh', 'auth', 'status'])
  } catch (error) {
    throw new Error(
      `Could not confirm that GitHub CLI is installed and authenticated. ${failureDetail(error)} Install gh and run gh auth login with contents: write access, then release again.`,
    )
  }
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout).trim()
    throw new Error(
      `Could not confirm that GitHub CLI is authenticated.${detail ? ` ${detail}` : ''} Run gh auth login with contents: write access, then release again.`,
    )
  }
}

async function gitReleaseFacts(tag: string): Promise<{ releasedCommit: string; tagCommit: string | null }> {
  const fetched = await output(['git', 'fetch', 'origin', '--tags'])
  if (fetched.exitCode !== 0) {
    const detail = (fetched.stderr || fetched.stdout).trim()
    throw new Error(`Could not fetch tags from origin.${detail ? ` ${detail}` : ''} Restore access to origin, then release again.`)
  }

  const head = await output(['git', 'rev-parse', 'HEAD'])
  if (head.exitCode !== 0 || head.stdout.trim().length === 0) {
    const detail = (head.stderr || head.stdout).trim()
    throw new Error(`Could not establish the released commit from HEAD.${detail ? ` ${detail}` : ''} Check out the commit to release, then release again.`)
  }

  const existingTag = await output(['git', 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`])
  if (existingTag.exitCode !== 0 && existingTag.exitCode !== 1) {
    const detail = (existingTag.stderr || existingTag.stdout).trim()
    throw new Error(`Could not establish which commit ${tag} names.${detail ? ` ${detail}` : ''} Repair the local tag, then release again.`)
  }
  return { releasedCommit: head.stdout.trim(), tagCommit: existingTag.exitCode === 0 ? existingTag.stdout.trim() : null }
}

async function githubReleaseExists(tag: string): Promise<boolean> {
  const result = await output(['gh', 'release', 'view', tag, '--json', 'tagName'])
  if (result.exitCode === 0) return true
  const detail = (result.stderr || result.stdout).trim()
  if (/release not found|no release found/i.test(detail)) return false
  throw new Error(
    `Could not establish whether GitHub Release ${tag} exists.${detail ? ` ${detail}` : ''} Restore GitHub access and contents: write permission, then release again.`,
  )
}

function readChangelog(directory: string, packageName: string): { packageName: string; changelogPath: string; changelogText: string } {
  const changelogPath = path.join(directory, 'CHANGELOG.md')
  try {
    return { packageName, changelogPath, changelogText: readFileSync(changelogPath, 'utf8') }
  } catch (error) {
    throw new Error(
      `Could not read ${changelogPath} for ${packageName}. ${failureDetail(error)} Add the changelog and run bun run version so it contains the release version, then release again.`,
    )
  }
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
  return {
    ...inspected,
    tarball,
    size: statSync(tarball).size,
    integrity: `sha512-${createHash('sha512').update(readFileSync(tarball)).digest('base64')}`,
  }
}

function integrityFromRegistry(stdout: string, name: string, version: string): string {
  try {
    const integrity = JSON.parse(stdout) as unknown
    if (typeof integrity === 'string' && integrity.length > 0) return integrity
  } catch {}
  throw new Error(`Could not establish npm's integrity for ${name}@${version}.`)
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
  const refusal = packedPackageRefusal(item.manifest, sharedVersion, item.hasLicense, workspaceNames)
  if (refusal) throw new Error(refusal)
}

const registryFacts = await Promise.all(
  packed.map(async (item) => ({
    item,
    lookup:
      offline || item.manifest.private
        ? undefined
        : await output(['npm', 'view', `${item.manifest.name}@${item.manifest.version}`, 'dist.integrity', '--json']),
  })),
)

const plans: ReleasePlan[] = []
for (const { item, lookup } of registryFacts) {
  const state = lookup ? registryState(lookup.exitCode, lookup.stdout, lookup.stderr) : 'missing'
  const decision = releaseDecision(state, item.manifest.private === true)
  if (decision === 'skip' && lookup) {
    const registryIntegrity = integrityFromRegistry(lookup.stdout, item.manifest.name, item.manifest.version)
    const refusal = publishedPackageRefusal(item.manifest.name, item.manifest.version, item.integrity, registryIntegrity)
    if (refusal) throw new Error(refusal)
  }
  plans.push({ package: item, decision })
}

const tag = `v${sharedVersion}`
const notesFile = path.join(OUTPUT, 'release-notes.md')
const notes = releaseNotes(
  sharedVersion,
  workspacePackages.map(({ directory, manifest }) => readChangelog(directory, manifest.name)),
)
async function plannedGitHubRelease(version: string) {
  await requireGitHubAccess()
  const { releasedCommit, tagCommit } = await gitReleaseFacts(tag)
  const releaseExists = await githubReleaseExists(tag)
  const actions = githubReleaseActions({ version, releasedCommit, tagCommit, releaseExists })
  if (actions.tag === 'refuse') throw new Error(actions.refusal)
  return { releasedCommit, actions }
}

// An offline dry run reaches no network, so it leaves out the GitHub and remote tag checks; every other run makes them before publishing.
const githubRelease = offline ? undefined : await plannedGitHubRelease(sharedVersion)
if (dryRun) console.log(notes)

for (const plan of plans) {
  const item = plan.package
  const result =
    plan.decision === 'hold' ? 'held (private, not published)' : plan.decision === 'skip' ? 'skip (already published)' : dryRun ? 'would publish' : 'publish'
  console.log(`${item.manifest.name}@${item.manifest.version} ${item.size} bytes — ${result}`)
  if (plan.decision === 'publish' && !dryRun) await run(['npm', 'publish', item.tarball, '--access', 'public'], ROOT, true)
}

if (!dryRun && githubRelease) {
  writeFileSync(notesFile, notes)
  if (githubRelease.actions.tag === 'create') {
    await run(['git', 'tag', tag, githubRelease.releasedCommit])
    await run(['git', 'push', 'origin', `refs/tags/${tag}`])
  }
  await run(['gh', 'release', githubRelease.actions.release, tag, '--title', tag, '--notes-file', notesFile])
}
