import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import type { Page } from 'playwright-core'
import type { Harness } from './harness.ts'

export async function verifyPrintedPageInlineOverflow(page: Page, documentInput: unknown, check: Harness['check']): Promise<void> {
  await page.evaluate(async (input) => {
    await customElements.whenDefined('segnavia-page')
    const shown = document.createElement('segnavia-page') as HTMLElement & { page: unknown }
    shown.id = 'inline-overflow-page'
    shown.style.cssText = 'display:block;inline-size:800px;block-size:600px'
    shown.page = input
    document.body.append(shown)
  }, documentInput)
  const frame = await page.locator('#inline-overflow-page iframe').contentFrame()
  await frame.locator('html[data-segnavia-composed]').waitFor({ state: 'attached' })
  const report = JSON.parse((await frame.locator('html').getAttribute(PREFLIGHT_ATTRIBUTE)) ?? 'null') as {
    issues?: Array<{ check?: string; severity?: string; subject?: string }>
  } | null
  const issues = report?.issues ?? []
  check(
    'a printed-page block wider than its column reports an inline-overflow warning',
    issues.some((issue) => issue.check === 'inline-overflow' && issue.severity === 'warning' && issue.subject === 'wide-demo-block'),
    JSON.stringify(issues),
  )
}
