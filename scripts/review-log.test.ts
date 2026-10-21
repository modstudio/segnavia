import { afterEach, describe, expect, it } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanGitEnv, currentTree } from './review-artifact'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCRIPT = join(ROOT, 'scripts/review-log.ts')
const RESERVED_KEYS: string[] = ['branch', 'round', 'timestamp', 'tier', 'tierReason', 'agentCount', 'reviewedSha', 'reviewedTree']
const temporaryRepositories: string[] = []

function git(repository: string, ...arguments_: string[]): string {
  return execFileSync('git', ['-C', repository, ...arguments_], { encoding: 'utf8', env: cleanGitEnv() }).trim()
}

function makeRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'segnavia-review-log-'))
  temporaryRepositories.push(repository)
  git(repository, 'init', '-q', '-b', 'main')
  git(repository, 'config', 'user.email', 'test@example.com')
  git(repository, 'config', 'user.name', 'Test')
  writeFileSync(join(repository, 'README.md'), 'seed\n')
  git(repository, 'add', 'README.md')
  git(repository, 'commit', '-qm', 'seed')
  git(repository, 'switch', '-qc', 'feature/SEGNA-130')
  return repository
}

function reviewLog(repository: string, findingsPath: string) {
  return spawnSync('bun', [SCRIPT, '--tier', '1', '--reason', 'test', '--agents', '2', '--findings', findingsPath], {
    cwd: repository,
    encoding: 'utf8',
    env: cleanGitEnv(),
  })
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) rmSync(repository, { recursive: true, force: true })
})

describe('review log findings', () => {
  it.each(RESERVED_KEYS)('refuses the reserved key %s', (key) => {
    const repository = makeRepository()
    const findingsPath = join(repository, 'findings.json')
    writeFileSync(findingsPath, JSON.stringify({ [key]: 'override' }))

    const result = reviewLog(repository, findingsPath)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`may not set reserved key '${key}'`)
  })

  it('preserves findings while computing every reserved field itself', () => {
    const repository = makeRepository()
    const findingsPath = join(repository, 'findings.json')
    writeFileSync(findingsPath, JSON.stringify({ findings: [{ message: 'found' }] }))
    const reviewedTree = currentTree(repository)

    const result = reviewLog(repository, findingsPath)
    const artifact = JSON.parse(readFileSync(join(repository, '.review-logs/feature-SEGNA-130-round-1.json'), 'utf8')) as Record<string, unknown>

    expect(result.status).toBe(0)
    expect(artifact).toMatchObject({
      branch: 'feature/SEGNA-130',
      round: 1,
      tier: 1,
      tierReason: 'test',
      agentCount: 2,
      reviewedSha: git(repository, 'rev-parse', 'HEAD'),
      reviewedTree,
      findings: [{ message: 'found' }],
    })
    expect(typeof artifact.timestamp).toBe('string')
  })
})
