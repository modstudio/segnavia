import { expect, test } from 'bun:test'
import { limitRefusal, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { awaitPrintedPageComposition, renderedPageDocument } from './printed-page-render.ts'

const composed = resolvePageHtml(
  Page.parse({
    html: '<p>body</p>',
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], rules: { every: 'body' } },
  }),
)

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
