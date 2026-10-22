import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'

test('pagesPdf refuses an empty collection with the action that clears it', async () => {
  const render = renderPagesPdf(
    [],
    {},
    {
      pagePdf: async () => ({ bytes: new Uint8Array() }),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow(new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.'))
})

test('pagesPdf renders the page objects it is given, so their slot preparation is found', async () => {
  const page = Page.parse({ html: '<p>Card</p>', size: { width: 336, height: 192 } })
  const seen: unknown[] = []
  const render = renderPagesPdf(
    [page],
    {},
    {
      pagePdf: async (rendered) => {
        seen.push(rendered)
        throw new Error('stop after the first page')
      },
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow('stop after the first page')
  expect(seen[0]).toBe(page)
})
