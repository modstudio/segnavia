import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import type { Frame } from 'playwright-core'

export type PreflightIssueShot = { check?: string; subject?: string }

export function readPreflightIssues(frame: Frame): Promise<PreflightIssueShot[]> {
  return frame.evaluate((attribute) => {
    const report = JSON.parse(document.documentElement.getAttribute(attribute) ?? 'null') as { issues?: PreflightIssueShot[] } | null
    return report?.issues ?? []
  }, PREFLIGHT_ATTRIBUTE)
}
