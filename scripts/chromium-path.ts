import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export function chromiumPath(): string {
  const candidates = [
    process.env.SEGNAVIA_CHROMIUM,
    path.join(homedir(), 'Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ].filter((candidate): candidate is string => Boolean(candidate))
  const found = candidates.find(existsSync)
  if (!found) throw new Error(`No Chromium executable was found at ${candidates.join(', ')}; set SEGNAVIA_CHROMIUM to a Chromium or Chrome executable`)
  return found
}
