import { expect, test } from 'bun:test'
import { type Motif, Page } from '@segnavia/format'
import { prepareShownPage, shownPageDocument } from '@segnavia/frame/motifs'
import { preparePagePdfPage, renderPageDocument } from './page-document.ts'

test('page element and pagePdf documents carry the same expanded motif body', async () => {
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

  const shown = await prepareShownPage(page, motifs, undefined, signal)
  const rendered = await preparePagePdfPage(page, motifs, signal)
  const frameHtml = shownPageDocument(shown.page, shown.resolved, { nonce: 'same' })
  const renderHtml = renderPageDocument(rendered, {}, false, 'same')

  expect(shown.page.html).toBe(rendered.html)
  expect(shown.page.html).toContain('<header>Held once</header>')
  expect(frameHtml).toContain(shown.page.html)
  expect(renderHtml).toContain(rendered.html)
})
