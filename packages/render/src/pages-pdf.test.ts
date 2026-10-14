import { expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { renderPagesPdf } from './pages-pdf.ts'

test('pagesPdf refuses an empty collection with the action that clears it', async () => {
  const render = renderPagesPdf(
    [],
    {},
    {
      pagePdf: async () => new Uint8Array(),
      piecePdf: async () => new Uint8Array(),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(render).rejects.toThrow(new RenderRefusedError('There is nothing to render. Pass at least one page to clear this refusal.'))
})
