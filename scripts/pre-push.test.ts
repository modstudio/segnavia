import { afterEach, describe, expect, it } from 'bun:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(ROOT, '.githooks/pre-push')
const GIT_LOCATION_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
]
const temporaryRepositories: string[] = []

function fixtureEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of GIT_LOCATION_KEYS) delete env[key]
  return env
}

function git(repository: string, ...arguments_: string[]): string {
  return execFileSync('git', ['-C', repository, ...arguments_], {
    encoding: 'utf8',
    env: fixtureEnv(),
  }).trim()
}

function commit(repository: string, path: string, content: string, subject: string): string {
  const fullPath = join(repository, path)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content)
  git(repository, 'add', '-A')
  git(repository, 'commit', '-qm', subject)
  return git(repository, 'rev-parse', 'HEAD')
}

function makeRepository(): { repository: string; base: string } {
  const repository = mkdtempSync(join(tmpdir(), 'segnavia-pre-push-'))
  temporaryRepositories.push(repository)
  git(repository, 'init', '-q', '-b', 'main')
  git(repository, 'config', 'user.email', 'test@example.com')
  git(repository, 'config', 'user.name', 'Test')
  const base = commit(repository, 'README.md', 'seed\n', 'seed')
  git(repository, 'switch', '-qc', 'feature/SEGNA-130')
  return { repository, base }
}

function recordReview(repository: string, tier: number): void {
  const directory = join(repository, '.review-logs')
  mkdirSync(directory)
  writeFileSync(
    join(directory, 'feature-SEGNA-130-round-1.json'),
    `${JSON.stringify(
      {
        tier,
        reviewedSha: git(repository, 'rev-parse', 'HEAD'),
        reviewedTree: git(repository, 'rev-parse', 'HEAD^{tree}'),
      },
      null,
      2,
    )}\n`,
  )
}

function push(repository: string, base: string): { status: number; output: string } {
  const head = git(repository, 'rev-parse', 'HEAD')
  const result = spawnSync('sh', [HOOK], {
    cwd: repository,
    encoding: 'utf8',
    env: fixtureEnv(),
    input: `refs/heads/feature/SEGNA-130 ${head} refs/heads/feature/SEGNA-130 ${base}\n`,
  })
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` }
}

afterEach(() => {
  for (const repository of temporaryRepositories.splice(0)) rmSync(repository, { recursive: true, force: true })
})

describe('pre-push review gate', () => {
  it('accepts a pushed tree covered by the recorded review', () => {
    const { repository, base } = makeRepository()
    commit(repository, 'ordinary.txt', 'reviewed\n', 'reviewed work')
    recordReview(repository, 1)

    expect(push(repository, base).status).toBe(0)
  })

  it('refuses and names a commit made after the review', () => {
    const { repository, base } = makeRepository()
    commit(repository, 'ordinary.txt', 'reviewed\n', 'reviewed work')
    recordReview(repository, 1)
    commit(repository, 'later.txt', 'unreviewed\n', 'unreviewed addition')

    const result = push(repository, base)
    expect(result.status).toBe(1)
    expect(result.output).toContain('Commits nobody reviewed')
    expect(result.output).toContain('unreviewed addition')
  })

  it('refuses a covered risk-surface diff reviewed at tier 1', () => {
    const { repository, base } = makeRepository()
    commit(repository, 'packages/frame/src/bridge-extra.ts', 'risky\n', 'bridge change')
    recordReview(repository, 1)

    const result = push(repository, base)
    expect(result.status).toBe(1)
    expect(result.output).toContain('require a recorded review tier of at least 2')
  })

  it('accepts rewritten history when the reviewed tree is unchanged', () => {
    const { repository, base } = makeRepository()
    commit(repository, 'ordinary.txt', 'reviewed\n', 'reviewed work')
    recordReview(repository, 1)
    const before = git(repository, 'rev-parse', 'HEAD')
    git(repository, 'commit', '--amend', '-qm', 'rewritten reviewed work')

    expect(git(repository, 'rev-parse', 'HEAD')).not.toBe(before)
    expect(push(repository, base).status).toBe(0)
  })
})
