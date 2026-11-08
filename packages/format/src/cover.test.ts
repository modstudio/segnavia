import { describe, expect, test } from 'bun:test'
import { COVER_DRAWING_VERSION, COVER_SHEET, Cover, type CoverDigestMaterial, coverDigest, digestCoverMaterial, MM_PER_PT, type Motif } from './index.ts'

interface PageDocumentFields {
  html?: string
  id?: string
  lang?: string
  dir?: 'ltr' | 'rtl'
  scripts?: 'refuse' | 'sandboxed' | 'trusted'
  print?: {
    paper: { width: number; height: number; unit: 'mm' | 'pt' }
    orientation?: 'portrait' | 'landscape'
    bleed?: number
    safe?: number
    marks?: boolean
  }
}

const pageDocument = ({ html = '', id, lang, dir, scripts, print }: PageDocumentFields = {}) => ({
  type: 'document' as const,
  kind: 'page' as const,
  settings: { lang, dir, scripts },
  print,
  children: [{ type: 'page' as const, id, body: { html } }],
})

const cover = (html = '<h1>Cover</h1>') => Cover.parse({ page: pageDocument({ html }) })

const motif = (key: string, revision = '1'): Motif => ({
  key,
  revision,
  label: key,
  fields: [],
  versions: [{ lang: 'en', html: `<p>${key}</p>` }],
  fonts: [],
})

describe('Cover', () => {
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

  test('refuses the legacy Page input and names the Document shape', () => {
    expect(() => Cover.parse({ page: { html: '<p>Legacy</p>' } })).toThrow('type')
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
})

describe('cover digest', () => {
  test('is stable across key and unordered input order', async () => {
    const first = Cover.parse({ name: 'Named', page: pageDocument({ html: 'same', lang: 'en' }), id: 'cover' })
    const second = Cover.parse({ id: 'cover', page: pageDocument({ lang: 'en', html: 'same' }), name: 'Named' })
    expect(await coverDigest(first, { stamp: 'renderer', fonts: ['z', 'a'], motifs: [motif('z'), motif('a')] })).toBe(
      await coverDigest(second, { stamp: 'renderer', fonts: ['a', 'z'], motifs: [motif('a'), motif('z')] }),
    )
  })

  test('is stable across motif revision order', async () => {
    const parsed = cover()
    const older = { ...motif('a', '1'), label: 'z' }
    const newer = { ...motif('a', '2'), label: 'a' }
    const digest = await coverDigest(parsed, { stamp: 'renderer', motifs: [newer, older] })
    expect(digest).toBe(await coverDigest(parsed, { stamp: 'renderer', motifs: [older, newer] }))
    expect(digest).toBe('6a45a9684ad238d04265f10715c3083c7adbe3975b6960f1dfa2cddc39cc1afe')
  })

  test('is stable across canonical motif order', async () => {
    const parsed = cover()
    const first = motif('a')
    const second = { ...motif('a'), label: 'different' }
    expect(await coverDigest(parsed, { stamp: 'renderer', motifs: [second, first] })).toBe(
      await coverDigest(parsed, { stamp: 'renderer', motifs: [first, second] }),
    )
  })

  test('changes with page HTML, fonts, motifs and renderer stamp', async () => {
    const base = await coverDigest(cover(), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('a')] })
    expect(await coverDigest(cover('<h1>Changed</h1>'), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('a')] })).not.toBe(base)
    expect(await coverDigest(cover(), { stamp: 'renderer', fonts: ['font-b'], motifs: [motif('a')] })).not.toBe(base)
    expect(await coverDigest(cover(), { stamp: 'renderer', fonts: ['font-a'], motifs: [motif('b')] })).not.toBe(base)
    expect(await coverDigest(cover(), { stamp: 'new-renderer', fonts: ['font-a'], motifs: [motif('a')] })).not.toBe(base)
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

  test('a parsed non-default sheet changes the digest', async () => {
    const portrait = Cover.parse({ page: pageDocument({ html: '<h1>Cover</h1>', print: { paper: { width: 100, height: 150, unit: 'mm' } } }) })
    expect(await coverDigest(portrait, { stamp: 'renderer' })).not.toBe(await coverDigest(cover(), { stamp: 'renderer' }))
  })

  test('ignores cover identity and page id', async () => {
    const first = Cover.parse({ id: 'cover-a', name: 'Alpha', page: pageDocument({ id: 'page-a', html: 'same' }) })
    const second = Cover.parse({ id: 'cover-b', name: 'Beta', page: pageDocument({ id: 'page-b', html: 'same' }) })
    expect(await coverDigest(first, { stamp: 'renderer' })).toBe(await coverDigest(second, { stamp: 'renderer' }))
  })
})
