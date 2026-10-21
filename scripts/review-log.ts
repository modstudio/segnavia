import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { artifactPath, currentBranch, reviewCoverage } from './review-artifact'

const COVERAGE_KEYS = ['reviewedSha', 'reviewedTree'] as const
const RESERVED_FINDING_KEYS = ['branch', 'round', 'timestamp', 'tier', 'tierReason', 'agentCount', ...COVERAGE_KEYS] as const

function argument(name: string): string | undefined {
  const position = process.argv.indexOf(`--${name}`)
  return position === -1 ? undefined : process.argv[position + 1]
}

function refuse(message: string): never {
  console.error(`review:log — ${message}`)
  process.exit(1)
}

for (const key of COVERAGE_KEYS) {
  if (process.argv.includes(`--${key}`)) refuse(`--${key} is not accepted — it is computed from git`)
}

const tierText = argument('tier')
const reason = argument('reason')
const agentsText = argument('agents')
if (tierText === undefined) refuse('--tier is required (0-3)')
if (!reason) refuse('--reason is required')
if (agentsText === undefined) refuse('--agents is required')

const tier = Number(tierText)
const agentCount = Number(agentsText)
if (!Number.isInteger(tier) || tier < 0 || tier > 3) refuse(`--tier must be an integer 0-3, got '${tierText}'`)
if (!Number.isInteger(agentCount) || agentCount < 0) refuse(`--agents must be a non-negative integer, got '${agentsText}'`)

const branch = currentBranch()
if (!branch) refuse('not on a branch')

const explicitRound = argument('round')
let round = explicitRound === undefined ? 1 : Number(explicitRound)
if (explicitRound === undefined) {
  while (existsSync(artifactPath(branch, round))) round += 1
} else if (!Number.isInteger(round) || round < 1) {
  refuse(`--round must be a positive integer, got '${explicitRound}'`)
}

let findings: Record<string, unknown> = {}
const findingsPath = argument('findings')
if (findingsPath) {
  if (!existsSync(findingsPath)) refuse(`--findings file not found: ${findingsPath}`)
  try {
    findings = JSON.parse(readFileSync(findingsPath, 'utf8')) as Record<string, unknown>
  } catch (error: unknown) {
    refuse(`--findings is not valid JSON: ${(error as Error).message}`)
  }
  for (const key of RESERVED_FINDING_KEYS) {
    if (key in findings) refuse(`--findings may not set reserved key '${key}'`)
  }
}

const artifact = {
  ...findings,
  branch,
  round,
  timestamp: new Date().toISOString(),
  tier,
  tierReason: reason,
  agentCount,
  ...reviewCoverage(),
}

mkdirSync('.review-logs', { recursive: true })
const output = artifactPath(branch, round)
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(`${output} — tier ${tier}, ${agentCount} agents, tree ${artifact.reviewedTree.slice(0, 12)}`)
