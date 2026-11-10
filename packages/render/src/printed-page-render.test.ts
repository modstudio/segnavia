import { expect, test } from 'bun:test'
import { limitRefusal, Page, PREFLIGHT_PRESETS } from '@segnavia/format'
import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/printed-page-document'
import { resolvePageHtml } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'

const composed = resolvePageHtml(
  Page.parse({
    html: '<p>body</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
  }),
)

test('printed-page composition reports the bounded preflight once before refusing its error', async () => {
  const reports: unknown[] = []
  const message = 'Shorten region body to clear it.'
  const attribute = JSON.stringify({
    issues: [{ check: 'region-overset', subject: 'x'.repeat(300), message }],
    facts: { pageCount: 1, pages: [{ folio: '1' }], fits: [] },
  })
  const tab = {
    waitForFunction: async () => {},
    evaluate: async (_function: unknown, name: unknown) => (name === PREFLIGHT_ATTRIBUTE ? attribute : null),
  } as unknown as Tab

  await expect(
    awaitPrintedPageComposition(tab, composed, { profile: PREFLIGHT_PRESETS.strict, seed: [], report: (report) => reports.push(report) }),
  ).rejects.toThrow(message)
  expect(reports).toHaveLength(1)
  expect((reports[0] as { issues: Array<{ subject: string }> }).issues[0]?.subject).toHaveLength(256)
})

test('turns a composer failure including its page bound into a render refusal', async () => {
  const tab = {
    waitForFunction: async () => {},
    evaluate: async () => limitRefusal('pages', 501, 500, { pagesSource: 'default' }),
  } as unknown as Tab
  const rendering = awaitPrintedPageComposition(tab, composed)
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow('501 papers, above the pages limit of 500')
})

test('embeds resolved app font CSS and carries failures in a printed-page frame', () => {
  const page = {
    ...composed,
    style: { fonts: { body: { faces: [{}] } } },
  }
  const html = renderedPageDocument(page, {}, true, undefined, '@font-face{font-family:"Body";src:url(data:font/ttf;base64,AA==)}', [
    { font: 'body', family: 'body', reason: 'unsupplied' },
  ])
  expect(html).toContain('@font-face{font-family:"Body";src:url(data:font/ttf;base64,AA==)}')
  expect(html).toContain('"fontLoads":[{"font":"body"')
  expect(html).toContain('initialFontFailures=[{"font":"body","family":"body","reason":"unsupplied"}]')
})

test('installs the compose-progress binding only when a reporter is present', () => {
  const withoutProgress = renderedPageDocument(composed, {})
  const withProgress = renderedPageDocument(composed, { progress: { report: () => {} } })
  expect(withoutProgress).not.toContain('__segnaviaComposeProgress')
  expect(withProgress).toContain('__segnaviaComposeProgress')
  expect(withProgress).toContain('data-segnavia-compose-progress')
})
