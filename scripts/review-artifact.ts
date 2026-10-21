import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const GIT_LOCATION_KEYS = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
]

function cleanGitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of GIT_LOCATION_KEYS) delete env[key]
  return { ...env, ...extra }
}

function git(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: cleanGitEnv(env),
  }).trim()
}

export function currentTree(cwd: string = process.cwd()): string {
  const temporary = mkdtempSync(join(tmpdir(), 'segnavia-review-index-'))
  const index = join(temporary, 'index')
  try {
    try {
      git(cwd, ['read-tree', 'HEAD'], { GIT_INDEX_FILE: index })
    } catch {
      // An unborn branch has no tree to seed; the empty temporary index is right.
    }
    git(cwd, ['add', '-A'], { GIT_INDEX_FILE: index })
    return git(cwd, ['write-tree'], { GIT_INDEX_FILE: index })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export function reviewCoverage(cwd: string = process.cwd()): { reviewedSha: string; reviewedTree: string } {
  return {
    reviewedSha: git(cwd, ['rev-parse', 'HEAD']),
    reviewedTree: currentTree(cwd),
  }
}

export function currentBranch(cwd: string = process.cwd()): string {
  return git(cwd, ['branch', '--show-current'])
}

export function branchSlug(branch: string): string {
  return branch.replace(/\//g, '-')
}

export function artifactPath(branch: string, round: number): string {
  return join('.review-logs', `${branchSlug(branch)}-round-${round}.json`)
}
