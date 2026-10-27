import { expect, test } from 'bun:test'
import { type Motif, Page } from '@segnavia/format'
import { frameDocument } from '@segnavia/frame/bridge'
import { expandFramePage } from '@segnavia/frame/motifs'
import { expandRenderPage } from './motif-expansion.ts'

test('frame and render documents expand a page motif to identical HTML', async () => {
  const motif: Motif = {
    key: 'letterhead',
    revision: 'current',
    label: 'Letterhead',
    fields: [],
    versions: [{ lang: 'en', html: '<header>Held once</header>' }],
    fonts: [],
  }
  const motifs = { source: { motif: async () => motif } }
  const page = Page.parse({ html: '<main data-motif="letterhead"></main>', lang: 'en' })
  const signal = new AbortController().signal
  const framePage = await expandFramePage(page, motifs, signal)
  const renderPage = await expandRenderPage(page, motifs, signal)
  const document = (html: string) => frameDocument(html, { scripts: page.scripts, nonce: 'same', lang: page.lang, relayKeys: false })

  expect(document(framePage.html)).toBe(document(renderPage.html))
  expect(framePage.html).toContain('<header>Held once</header>')
})
