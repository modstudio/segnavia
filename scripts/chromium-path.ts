import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const CHROMIUM_ENVIRONMENT_VARIABLE = 'SEGNAVIA_CHROMIUM'
export const CHROMIUM_PATH_MODULE = import.meta.path.split(path.sep).slice(-2).join('/')

function cacheCandidates(directory: string, executable: string): string[] {
  let builds: string[]
  try {
    builds = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
  } catch {
    return []
  }
  return builds.map((build) => path.join(directory, build, executable))
}

export function chromiumPath(): string {
  const configured = process.env[CHROMIUM_ENVIRONMENT_VARIABLE]
  if (configured !== undefined) {
    if (existsSync(configured)) return configured
    throw new Error(
      `${CHROMIUM_ENVIRONMENT_VARIABLE} names ${JSON.stringify(configured)}, which does not exist; unset ${CHROMIUM_ENVIRONMENT_VARIABLE} to search the default locations or set it to an existing Chromium or Chrome executable`,
    )
  }
  const candidates = [
    ...cacheCandidates(path.join(homedir(), 'Library/Caches/ms-playwright'), 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ...cacheCandidates('/opt/pw-browsers', 'chrome-linux/chrome'),
  ]
  const found = candidates.find(existsSync)
  if (!found)
    throw new Error(`No Chromium executable was found at ${candidates.join(', ')}; set ${CHROMIUM_ENVIRONMENT_VARIABLE} to a Chromium or Chrome executable`)
  return found
}
