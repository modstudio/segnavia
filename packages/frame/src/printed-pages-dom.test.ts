import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Page, type PreflightProfile } from '@segnavia/format'
import { resolvePrintedPageHtml } from '@segnavia/html'
import type { ServedFrameDocument } from './frame-write.ts'
import { FramePoolTestElement, installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import { composePrintedPaper, type PrintedPaperState } from './printed-pages-dom.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => restoreDocument())

const page = resolvePrintedPageHtml(
  Page.parse({
    print: { paper: 'letter' },
    printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }], sections: [{ id: 'body', html: '<p>Body</p>' }] },
  }),
)
const prepared = { page, count: 1, fontCss: '', fontFailures: [], layouts: [], preflightSeed: [] }

test('a printed paper serves its frame and reuses the unchanged document', async () => {
  const served: ServedFrameDocument[] = []
  const state: PrintedPaperState = { page: 1, slot: new FramePoolTestElement('div') as unknown as HTMLElement }
  const options = {
    css: '',
    origins: [],
    profile: {} as PreflightProfile,
    serveFrame: (document: ServedFrameDocument) => {
      served.push(document)
      return '/frames/printed-page'
    },
  }

  composePrintedPaper(state, prepared, 1, 1, options)
  await Promise.resolve()
  expect(served[0]?.kind).toBe('printed-page')
  expect(state.pending?.src).toBe('https://frames.example/frames/printed-page')

  state.shown = state.pending
  state.pending = undefined
  composePrintedPaper(state, prepared, 1, 2, options)
  await Promise.resolve()
  expect(served).toHaveLength(1)
  expect(state.shown?.dataset.generation).toBe('2')
})
