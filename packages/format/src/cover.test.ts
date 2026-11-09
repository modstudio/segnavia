import { describe, expect, test } from 'bun:test'
import {
  COVER_DRAWING_VERSION,
  COVER_SHEET,
  Cover,
  type CoverDigestMaterial,
  coverDigest,
  digestCoverMaterial,
  jsonSchemas,
  MM_PER_PT,
  type Motif,
  pageDirection,
  sheetMm,
} from './index.ts'

interface PageDocumentFields {
  html?: string
  id?: string
  lang?: string
  dir?: 'ltr' | 'rtl'
  scripts?: 'refuse' | 'sandboxed'
  brand?: string
  print?: {
    paper: { width: number; height: number; unit: 'mm' | 'pt' }
    orientation?: 'portrait' | 'landscape'
    bleed?: number
    safe?: number
    marks?: boolean
  }
}

const pageDocument = ({ html = '', id, lang, dir, scripts, brand, print }: PageDocumentFields = {}) => ({
  type: 'document' as const,
  kind: 'page' as const,
  brand,
  settings: { lang, dir, scripts },
  print,
  children: [{ type: 'page' as const, id, body: { html } }],
})

const coverInput = (html = '<h1>Cover</h1>') => ({ page: pageDocument({ html }) })
const cover = (html = '<h1>Cover</h1>') => Cover.parse(coverInput(html))

const motif = (key: string, revision = '1'): Motif => ({
  key,
  revision,
  label: key,
  fields: [],
  versions: [{ lang: 'en', html: `<p>${key}</p>` }],
  fonts: [],
})

describe('Cover', () => {
  test('refuses a named page brand with the cover-specific remedy', () => {
    expect(() => Cover.parse({ page: pageDocument({ brand: 'house' }) })).toThrow(/cover page brand.*house.*remove the brand from the cover page/)
  })

  test('fills the cover sheet and print defaults when print is absent', () => {
    expect(cover().page.print).toEqual({
      paper: { width: 160, height: 100, unit: 'mm' },
      orientation: 'landscape',
      bleed: 0,
      safe: 0,
      marks: false,
      markColor: 'black',
    })
  })

  test.each([
    { width: 160, height: 100, unit: 'mm' as const },
    { width: 160 / MM_PER_PT, height: 100 / MM_PER_PT, unit: 'pt' as const },
  ])('accepts an explicit cover sheet in $unit', (paper) => {
    expect(() => Cover.parse({ page: pageDocument({ print: { paper, orientation: 'landscape' } }) })).not.toThrow()
  })

  test('accepts a non-default portrait sheet', () => {
    expect(Cover.parse({ page: pageDocument({ print: { paper: { width: 100, height: 150, unit: 'mm' } } }) }).page.print.paper).toEqual({
      width: 100,
      height: 150,
      unit: 'mm',
    })
  })

  test('refuses print artifacts and sandboxed scripts with remedies', () => {
    expect(() => Cover.parse({ page: pageDocument({ print: { paper: { width: 160, height: 100, unit: 'mm' }, bleed: 2 } }) })).toThrow(
      'page.print.bleed must be 0; remove bleed',
    )
    expect(() => Cover.parse({ page: pageDocument({ scripts: 'sandboxed' }) })).toThrow("page.scripts must be 'refuse'; refuse scripts")
    expect(() => Cover.parse({ page: pageDocument({ print: { paper: { width: 160, height: 100, unit: 'mm' }, safe: 5 } }) })).toThrow(
      'page.print.safe must be 0; remove the safe area',
    )
    expect(() => Cover.parse({ page: pageDocument({ print: { paper: { width: 160, height: 100, unit: 'mm' }, marks: true } }) })).toThrow(
      'page.print.marks must be false; remove marks',
    )
  })

  test('keeps a Hebrew page unchanged apart from its filled print setting', () => {
    const parsed = Cover.parse({ page: pageDocument({ html: '<p>שלום</p>', lang: 'he', dir: 'rtl' }) })
    expect(parsed.page).toMatchObject({ body: { html: '<p>שלום</p>' }, lang: 'he', dir: 'rtl' })
  })

  test('resolves a Hebrew page Document without an explicit direction right to left', () => {
    const parsed = Cover.parse({ page: pageDocument({ html: '<p>שלום</p>', lang: 'he' }) })
    if (!('html' in parsed.page.body)) throw new Error('the cover page body was not stored HTML')
    expect(pageDirection({ ...parsed.page, html: parsed.page.body.html })).toBe('rtl')
  })

  test('refuses a markdown page body with the stored HTML remedy', () => {
    expect(() =>
      Cover.parse({
        page: {
          type: 'document',
          kind: 'page',
          children: [{ type: 'page', body: { markdown: '# Cover' } }],
        },
      }),
    ).toThrow(
      'a cover page body must be stored HTML in body.html; pass the Document through @segnavia/html parseDocument first, or give the page an html body, to clear this refusal',
    )
  })

  test('refuses the legacy Page input and names the Document shape', () => {
    expect(() => Cover.parse({ page: { html: '<p>Legacy</p>' } })).toThrow('document')
  })

  test('refuses a non-page Document by naming kind page', () => {
    expect(() =>
      Cover.parse({
        page: {
          type: 'document',
          kind: 'printed',
          print: { paper: 'letter' },
          parentPages: [{ type: 'parentPage', name: 'body' }],
          rules: { every: 'body' },
          children: [{ type: 'page', body: { html: '' } }],
        },
      }),
    ).toThrow('use kind page to clear this refusal')
  })

  test('publishes the page Document input in the cover JSON Schema', () => {
    const schema = jsonSchemas().cover as { properties?: { page?: unknown } }
    expect(schema.properties?.page).toMatchObject({
      type: 'object',
      properties: { type: { const: 'document' }, kind: expect.any(Object) },
    })
  })
})

describe('cover digest', () => {
  test('an input has the digest of its parsed cover material', async () => {
    const input = coverInput()
    const parsed = Cover.parse(input)
    const digest = await digestCoverMaterial({
      page: parsed.page,
      sheet: sheetMm(parsed.page.print),
      drawingVersion: COVER_DRAWING_VERSION,
      stamp: 'renderer',
      fonts: [],
      motifs: [],
    })
    expect(await coverDigest(input, { stamp: 'renderer' })).toBe(digest)
  })

  test('is stable across key and unordered input order', async () => {
    const first = { name: 'Named', page: pageDocument({ html: 'same', lang: 'en' }), id: 'cover' }
    const second = { id: 'cover', page: pageDocument({ lang: 'en', html: 'same' }), name: 'Named' }
    expect(await coverDigest(first, { stamp: 'renderer', fonts: ['z', 'a'], motifs: [motif('z'), motif('a')] })).toBe(
      await coverDigest(second, { stamp: 'renderer', fonts: ['a', 'z'], motifs: [motif('a'), motif('z')] }),
    )
  })

  test('is stable across motif revision order', async () => {
    const input = coverInput()
    const older = { ...motif('a', '1'), label: 'z' }
    const newer = { ...motif('a', '2'), label: 'a' }
    const digest = await coverDigest(input, { stamp: 'renderer', motifs: [newer, older] })
    expect(digest).toBe(await coverDigest(input, { stamp: 'renderer', motifs: [older, newer] }))
    expect(digest).toBe('6a45a9684ad238d04265f10715c3083c7adbe3975b6960f1dfa2cddc39cc1afe')
  })

  test('is stable across canonical motif order', async () => {
    const input = coverInput()
    const first = motif('a')
    const second = { ...motif('a'), label: 'different' }
    expect(await coverDigest(input, { stamp: 'renderer', motifs: [second, first] })).toBe(
      await coverDigest(input, { stamp: 'renderer', motifs: [first, second] }),
    )
  })

  test('changes with page HTML, fonts, motifs and renderer stamp', async () => {
    const base = await coverDigest(coverInput(), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('a')] })
    expect(await coverDigest(coverInput('<h1>Changed</h1>'), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('a')] })).not.toBe(base)
    expect(await coverDigest(coverInput(), { stamp: 'renderer', fonts: ['font-b'], motifs: [motif('a')] })).not.toBe(base)
    expect(await coverDigest(coverInput(), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('b')] })).not.toBe(base)
    expect(await coverDigest(coverInput(), { stamp: 'new-renderer', fonts: ['font-a'], motifs: [motif('a')] })).not.toBe(base)
  })

  test('changes with the sheet and drawing version', async () => {
    const material: CoverDigestMaterial = {
      page: cover().page,
      sheet: COVER_SHEET,
      drawingVersion: COVER_DRAWING_VERSION,
      stamp: 'renderer',
      fonts: [],
      motifs: [],
    }
    const base = await digestCoverMaterial(material)
    expect(await digestCoverMaterial({ ...material, sheet: { width: 80, height: 50 } })).not.toBe(base)
    expect(await digestCoverMaterial({ ...material, drawingVersion: COVER_DRAWING_VERSION + 1 })).not.toBe(base)
  })

  test('a non-default sheet changes the digest', async () => {
    const portrait = { page: pageDocument({ html: '<h1>Cover</h1>', print: { paper: { width: 100, height: 150, unit: 'mm' } } }) }
    expect(await coverDigest(portrait, { stamp: 'renderer' })).not.toBe(await coverDigest(coverInput(), { stamp: 'renderer' }))
  })

  test('ignores cover identity and page id', async () => {
    const first = { id: 'cover-a', name: 'Alpha', page: pageDocument({ id: 'page-a', html: 'same' }) }
    const second = { id: 'cover-b', name: 'Beta', page: pageDocument({ id: 'page-b', html: 'same' }) }
    expect(await coverDigest(first, { stamp: 'renderer' })).toBe(await coverDigest(second, { stamp: 'renderer' }))
  })
})
