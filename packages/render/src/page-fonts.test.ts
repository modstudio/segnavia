import { describe, expect, test } from 'bun:test'
import type { AppFont, FontFace, FontSource } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { expandFramePage, FontRefusedError, resolvePageFonts } from '@segnavia/frame/motifs'
import { fontCss } from '@segnavia/html'
import { renderPageDocument } from './page-document.ts'

const data = new Uint8Array([0])
const serifFace: FontFace = { family: 'Body Serif', data, format: 'truetype' }
const headingFace: FontFace = { family: 'Heading Sans', data, format: 'truetype' }
const serif: AppFont = { family: 'Body Serif', faces: [serifFace], generic: 'serif' }
const heading: AppFont = { family: 'Heading Sans', faces: [headingFace], generic: 'sans-serif' }
const source: FontSource = {
  font: async (name) => ({ serif, heading })[name],
}
const signal = new AbortController().signal
const letterhead = {
  key: 'letterhead',
  revision: '1',
  label: 'Letterhead',
  fields: [] as [],
  versions: [{ lang: 'en', html: '<header style="font-family: var(--segnavia-font-heading)">Head</header>' }],
  fonts: [{ app: 'heading' as const }],
}

describe('server render document fonts', () => {
  test('embeds the same @font-face bytes and --segnavia-font-serif as the resolved css', async () => {
    const page = Page.parse({
      html: '<p style="font-family: var(--segnavia-font-serif)"><span data-motif="letterhead"></span></p>',
      fonts: [{ app: 'serif' }],
      lang: 'en',
    })
    const expanded = await expandFramePage(page, { source: { motif: async () => letterhead } }, signal)
    const css = await resolvePageFonts(expanded.page, expanded.fonts, { source }, signal)
    expect(css).toBe(
      fontCss({
        app: new Map([
          ['serif', serif],
          ['heading', heading],
        ]),
      }),
    )
    const document = renderPageDocument(expanded.page, { css })
    expect(document).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
    expect(document).toContain('--segnavia-font-serif:"Body Serif",serif')
    expect(document).toContain('--segnavia-font-heading:"Heading Sans",sans-serif')
  })

  test('refuses an unknown name at render', async () => {
    const page = Page.parse({ html: '<p></p>', fonts: [{ app: 'missing' }] })
    await expect(resolvePageFonts(page, [], { source }, signal)).rejects.toThrow(FontRefusedError)
    await expect(resolvePageFonts(page, [], { source }, signal)).rejects.toThrow(
      'page could not establish app font "missing"; make that font available from the source to clear this refusal.',
    )
  })
})
