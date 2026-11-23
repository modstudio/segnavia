import { expect, test } from 'bun:test'
import { Imposition, impose, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import type { ServedFrameDocument } from './frame-write.ts'
import { writePrintablePaper } from './paper-frame-serving.ts'

test('a paper DOM writer serves its bridge-carrying page frame', async () => {
  const frameValue = {
    ownerDocument: { baseURI: 'https://frames.example/deck/' },
    src: '',
    srcdoc: '',
    removeAttribute(this: { srcdoc: string }, name: string) {
      if (name === 'srcdoc') this.srcdoc = ''
    },
  }
  const frame = frameValue as unknown as HTMLIFrameElement
  const box = { innerHTML: '', querySelectorAll: () => [frame] } as unknown as HTMLElement
  let served: ServedFrameDocument | undefined
  const imposition = Imposition.parse({
    paper: { width: 8.5, height: 11, unit: 'in' },
    columns: 1,
    rows: 1,
    cell: { width: 215.9, height: 279.4 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    gap: { column: 0, row: 0 },
  })
  const page = Page.parse({ html: '<p>paper</p>', print: { paper: 'letter' } })
  writePrintablePaper(
    box,
    [resolvePageHtml(page)],
    imposition,
    impose(imposition, 1, page.print),
    0,
    { nonce: 'test' },
    'front',
    (document) => {
      served = document
      return '/frames/paper'
    },
    () => {},
  )
  await Promise.resolve()
  expect(served?.kind).toBe('printed-page')
  expect(frameValue.src).toBe('https://frames.example/frames/paper')
})
