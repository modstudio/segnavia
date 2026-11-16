import { PREFLIGHT_PRESETS } from '@segnavia/format'
import { printedPageDocument } from '@segnavia/frame/printed-page-document'
import type { Page } from 'playwright-core'
import type { Harness } from './harness.ts'

interface HjViolationReport {
  issues?: Array<{ check?: string; subject?: string; location?: { folio?: string } }>
}

export async function verifyPrintedPageHjViolation(page: Page, check: Harness['check']): Promise<void> {
  const source = printedPageDocument(
    {
      type: 'document',
      kind: 'printed',
      settings: { lang: 'en' },
      print: { paper: 'letter' },
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          geometry: { margin: { blockStart: 132, blockEnd: 132, inlineStart: 90, inlineEnd: 90 } },
        },
      ],
      parentRules: [{ parent: 'body' }],
      children: [
        {
          type: 'page',
          body: {
            html: `<style>p{margin:0;font:16px/20px sans-serif;text-align:justify;--segnavia-composer:paragraph;--segnavia-hyphenate:false;--segnavia-word-spacing:80% 100% 120%}</style><p data-segnavia-id="hj-demo">a<br><span style="display:inline-block;inline-size:400px"></span><br>tail</p><div style="display:none"><p data-segnavia-id="hidden-hj-demo"><span style="display:inline-block;inline-size:400px"></span> hidden</p></div>`,
          },
        },
      ],
    },
    { nonce: 'hj-violation-preflight', profile: PREFLIGHT_PRESETS.default },
  )
  const report = await page.evaluate(async (frameSource) => {
    return new Promise<HjViolationReport>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The H&J preflight report did not arrive.')), 20_000)
      const frame = document.createElement('iframe')
      frame.setAttribute('sandbox', 'allow-scripts')
      window.addEventListener('message', (event) => {
        const message = event.data as { type?: string; report?: HjViolationReport }
        if (event.source !== frame.contentWindow || message.type !== 'segnavia:preflight' || !message.report) return
        window.clearTimeout(timeout)
        resolve(message.report)
      })
      document.body.replaceChildren(frame)
      frame.srcdoc = frameSource
    })
  }, source)
  const violations = (report.issues ?? []).filter((issue) => issue.check === 'hj-violations')
  check(
    'a split composed paragraph reports one H&J violation at its worst line on the second page',
    violations.length === 1 && violations[0]?.subject === 'hj-demo' && violations[0]?.location?.folio === '2',
    JSON.stringify(violations),
  )
  check(
    'a hidden zero-measure paragraph produces no H&J violation',
    violations.every((issue) => issue.subject !== 'hidden-hj-demo'),
    JSON.stringify(violations),
  )
}
