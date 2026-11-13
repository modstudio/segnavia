import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import type { Page } from 'playwright-core'
import type { Harness } from './harness.ts'

export async function verifyPrintedPageInlineOverflow(
  page: Page,
  documentInput: unknown,
  motifs: Array<{ key: string }>,
  check: Harness['check'],
): Promise<void> {
  await page.evaluate(
    async ({ input, motifs }) => {
      await customElements.whenDefined('segnavia-page')
      const shown = document.createElement('segnavia-page') as HTMLElement & { motifs: unknown; page: unknown }
      shown.id = 'inline-overflow-page'
      shown.style.cssText = 'display:block;inline-size:800px;block-size:600px'
      shown.motifs = { source: { motif: async (key: string) => motifs.find((motif) => motif.key === key) } }
      shown.page = input
      document.body.append(shown)
    },
    { input: documentInput, motifs },
  )
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
