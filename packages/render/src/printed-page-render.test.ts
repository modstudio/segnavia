import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { awaitPrintedPageComposition } from './printed-page-render.ts'

const composed = Page.parse({
  html: '<p>body</p>',
  print: { paper: 'letter' },
  printedPages: { parents: [{ name: 'body' }], rules: { every: 'body' } },
})

test('turns a composer failure including its page bound into a render refusal', async () => {
  const tab = {
    waitForFunction: async () => {},
    evaluate: async () => 'the composed flow needs 501 papers, above the limit 500; shorten the content to clear this refusal',
  } as unknown as Tab
  const rendering = awaitPrintedPageComposition(tab, composed)
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow('501 papers, above the limit 500')
})
