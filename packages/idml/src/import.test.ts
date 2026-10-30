import { describe, expect, test } from 'bun:test'
import { fontReferenceRefusals } from '@segnavia/html'
import { importIdml } from './import.ts'
import { testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'
const designmap =
  '<Document Self="sample"><DocumentPreference PageWidth="396" PageHeight="612" FacingPages="true" PageBinding="LeftToRight"/><MarginPreference Top="36" Bottom="36" Left="30" Right="40"/><idPkg:Spread src="Spreads/Spread_s.xml"/><idPkg:MasterSpread src="MasterSpreads/MasterSpread_m.xml"/></Document>'

const frame = (story: string, left: number): string =>
  `<TextFrame ParentStory="${story}" ItemTransform="1 0 0 1 ${left} 0"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame>`

describe('importIdml', () => {
  test('validates and imports an IDML package end to end', async () => {
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: designmap, method: 8 },
      {
        name: 'Spreads/Spread_s.xml',
        content: `<Spread Self="s"><Page Self="p1" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 0 0"/><Page Self="p2" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/><Group ItemTransform="1 0 0 1 100 0">${frame('later', 0)}</Group>${frame('story', 0)}${frame('off-page', 300)}</Spread>`,
      },
      {
        name: 'MasterSpreads/MasterSpread_m.xml',
        content: `<MasterSpread Self="m"><Page Self="mp" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 0 0"/>${frame('master-story', 0)}</MasterSpread>`,
      },
      { name: 'Stories/Story_later.xml', content: '<Story Self="later"/>' },
      { name: 'Stories/Story_story.xml', content: '<Story Self="story"><Content>ignored in this slice</Content></Story>' },
      { name: 'Stories/Story_off.xml', content: '<Story Self="off-page"/>' },
      { name: 'Stories/Story_master.xml', content: '<Story Self="master-story"/>' },
    ])
    const result = await importIdml(bytes)
    expect(result.book.body.map((chapter) => chapter.title)).toEqual(['story', 'later', 'off-page'])
    expect(result.book.dir).toBe('ltr')
    expect(result.book.page?.margin.inner).toBeCloseTo(30 * (25.4 / 72))
    expect(result.book.page?.margin.outer).toBeCloseTo(40 * (25.4 / 72))
    expect(result.report.partsRead).toHaveLength(7)
    expect(result.report.partsRead).not.toContain('mimetype')
    expect(result.report.unsupportedElements).toMatchObject({ 'TextFrame off page': 1, 'master story': 1 })
  })

  test('refuses a missing or wrong IDML identity entry by name', async () => {
    await expect(importIdml(await testZip([{ name: 'designmap.xml', content: designmap }]))).rejects.toThrow('mimetype entry is missing')
    await expect(
      importIdml(
        await testZip([
          { name: 'mimetype', content: 'application/zip' },
          { name: 'designmap.xml', content: designmap },
        ]),
      ),
    ).rejects.toThrow('not application/vnd.adobe.indesign-idml-package')
    await expect(importIdml(await testZip([{ name: 'mimetype', content: mimetype }]))).rejects.toThrow('designmap.xml entry is missing')
  })

  test('imports styled story HTML, columns, CSS, fonts, and detailed unsupported findings', async () => {
    const styledMap = designmap.replace('</Document>', '<idPkg:Styles src="Resources/Styles.xml"/><idPkg:Graphic src="Resources/Graphic.xml"/></Document>')
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: styledMap },
      {
        name: 'Spreads/Spread_s.xml',
        content:
          '<Spread Self="s"><Page Self="p" GeometricBounds="0 0 100 100"/><TextFrame ParentStory="story"><Properties><TextFramePreference TextColumnCount="2" TextColumnGutter="12"/></Properties><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame></Spread>',
      },
      { name: 'MasterSpreads/MasterSpread_m.xml', content: '<MasterSpread Self="m"/>' },
      {
        name: 'Resources/Styles.xml',
        content:
          '<idPkg:Styles><RootParagraphStyleGroup><ParagraphStyle Self="root" Name="$ID/[No paragraph style]" ParagraphDirection="RightToLeftDirection" AppliedLanguage="$ID/Hebrew"/><ParagraphStyle Self="body" Name="Body" BasedOn="root" PointSize="12" SpanColumnType="SingleColumn" AppliedFont="Hebrew Face" FontStyle="Regular" RuleAbove="true"/></RootParagraphStyleGroup></idPkg:Styles>',
      },
      {
        name: 'Resources/Graphic.xml',
        content: '<idPkg:Graphic><Color Self="Color/Red" Name="Red" Model="Process" Space="RGB" ColorValue="255 0 0"/></idPkg:Graphic>',
      },
      {
        name: 'Stories/Story_story.xml',
        content:
          '<Story Self="story"><ParagraphStyleRange AppliedParagraphStyle="body"><CharacterStyleRange><Content>&lt;script&gt;שלום</Content></CharacterStyleRange><Table/></ParagraphStyleRange></Story>',
      },
    ])
    const result = await importIdml(bytes)
    const chapter = result.book.body[0]
    if (!chapter || !('html' in chapter)) throw new Error('Expected an imported chapter.')
    expect(result.book).toMatchObject({ dir: 'ltr', lang: 'he', page: { columnGap: 12 * (25.4 / 72) } })
    expect(chapter.html).toContain('class="idml-p-body" dir="rtl" data-columns="2"')
    expect(chapter.html).toContain('&lt;script&gt;שלום')
    expect(result.book.css).toContain('font-size:12pt')
    expect(result.book.css).not.toContain('font-family')
    expect(result.book.css).toContain('font-weight:400')
    expect(result.book.css).not.toContain('font-style')
    expect(result.report.fonts).toMatchObject([{ appliedFont: 'Hebrew Face', fontStyle: 'Regular' }])
    expect(result.report.unmappedFonts).toMatchObject([{ appliedFont: 'Hebrew Face', fontStyle: 'Regular' }])
    expect(result.report.unsupportedElements).toMatchObject({ Table: 1 })
    expect(result.report.unsupportedStyleProperties).toMatchObject({ RuleAbove: 1 })
    expect(result.report.locations['element:Table']).toBeDefined()
  })

  test('maps local and app fonts into Book references and style and override CSS once per face', async () => {
    const styledMap = designmap.replace('</Document>', '<idPkg:Styles src="Resources/Styles.xml"/><idPkg:Fonts src="Resources/Fonts.xml"/></Document>')
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: styledMap },
      { name: 'Spreads/Spread_s.xml', content: `<Spread Self="s"><Page Self="p" GeometricBounds="0 0 100 100"/>${frame('story', 0)}</Spread>` },
      { name: 'MasterSpreads/MasterSpread_m.xml', content: '<MasterSpread Self="m"/>' },
      {
        name: 'Resources/Styles.xml',
        content:
          '<idPkg:Styles><RootParagraphStyleGroup><ParagraphStyle Self="body" Name="Body" AppliedFont="Book Face" FontStyle="Semi Bold"/></RootParagraphStyleGroup><RootCharacterStyleGroup><CharacterStyle Self="body-char" Name="Body Character" AppliedFont="Book Face" FontStyle="Semi Bold"/></RootCharacterStyleGroup></idPkg:Styles>',
      },
      {
        name: 'Resources/Fonts.xml',
        content:
          '<idPkg:Fonts><FontFamily Name="Book Face"><Font FontFamily="Book Face" FontStyleName="Semi Bold" PostScriptName="BookFace-SemiBold"/></FontFamily><FontFamily Name="Display Face"><Font FontFamily="Display Face" FontStyleName="Bold Italic" PostScriptName="Display-BoldItalic"/></FontFamily></idPkg:Fonts>',
      },
      {
        name: 'Stories/Story_story.xml',
        content:
          '<Story Self="story"><ParagraphStyleRange AppliedParagraphStyle="body"><CharacterStyleRange AppliedCharacterStyle="body-char"><Content>Body</Content></CharacterStyleRange><CharacterStyleRange AppliedFont="Display Face" FontStyle="Bold Italic"><Content>Display</Content></CharacterStyleRange></ParagraphStyleRange></Story>',
      },
    ])
    const calls: unknown[] = []
    const result = await importIdml(bytes, {
      font(font) {
        calls.push(font)
        return font.family === 'Display Face' ? { local: 'Installed Display', fallback: 'body' } : { app: 'body' }
      },
    })
    expect(calls).toEqual([
      { family: 'Book Face', style: 'Semi Bold', postscriptName: 'BookFace-SemiBold' },
      { family: 'Display Face', style: 'Bold Italic', postscriptName: 'Display-BoldItalic' },
    ])
    expect(result.book.fonts).toEqual([{ app: 'body' }, { local: 'Installed Display', fallback: 'body' }])
    expect(result.book.css).toContain('font-family:var(--segnavia-font-body);font-weight:600')
    expect(result.book.css).toContain('font-family:"Installed Display", var(--segnavia-font-body);font-weight:700;font-style:italic')
    expect(fontReferenceRefusals(`<style>${result.book.css}</style>`, result.book.fonts ?? [], new Set(['body']))).toEqual([])
  })

  test('refuses an invalid host font answer by font name', async () => {
    const styledMap = designmap.replace('</Document>', '<idPkg:Styles src="Resources/Styles.xml"/></Document>')
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: styledMap },
      { name: 'Spreads/Spread_s.xml', content: `<Spread Self="s"><Page Self="p" GeometricBounds="0 0 100 100"/>${frame('story', 0)}</Spread>` },
      { name: 'MasterSpreads/MasterSpread_m.xml', content: '<MasterSpread Self="m"/>' },
      {
        name: 'Resources/Styles.xml',
        content: '<idPkg:Styles><ParagraphStyle Self="body" Name="Body" AppliedFont="Book Face" FontStyle="Regular"/></idPkg:Styles>',
      },
      {
        name: 'Stories/Story_story.xml',
        content: '<Story Self="story"><ParagraphStyleRange AppliedParagraphStyle="body"><Content>Words</Content></ParagraphStyleRange></Story>',
      },
    ])
    await expect(importIdml(bytes, { font: () => ({ local: 'Book Face', fallback: 'Not Valid' }) as never })).rejects.toThrow(
      'host font mapping for "Book Face" style "Regular" is invalid',
    )
  })

  test('reads based-on, font and leading values from a style Properties child', async () => {
    const styledMap = designmap
      .replace('PageBinding="LeftToRight"', 'PageBinding="RightToLeft"')
      .replace('</Document>', '<idPkg:Styles src="Resources/Styles.xml"/></Document>')
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: styledMap },
      {
        name: 'Spreads/Spread_s.xml',
        content: `<Spread Self="s"><Page Self="p" GeometricBounds="0 0 100 100"/>${frame('story', 0)}</Spread>`,
      },
      { name: 'MasterSpreads/MasterSpread_m.xml', content: '<MasterSpread Self="m"/>' },
      {
        name: 'Resources/Styles.xml',
        content:
          '<idPkg:Styles><RootParagraphStyleGroup><ParagraphStyle Self="root" Name="$ID/[No paragraph style]" AppliedLanguage="$ID/Hebrew"/><ParagraphStyle Self="body" Name="Body"><Properties><BasedOn>root</BasedOn><AppliedFont>Hebrew Face</AppliedFont><Leading>18</Leading></Properties></ParagraphStyle></RootParagraphStyleGroup></idPkg:Styles>',
      },
      {
        name: 'Stories/Story_story.xml',
        content:
          '<Story Self="story"><StoryPreference StoryDirection="LeftToRightDirection"/><ParagraphStyleRange AppliedParagraphStyle="body"><Content>שלום</Content></ParagraphStyleRange></Story>',
      },
    ])
    const result = await importIdml(bytes)
    expect(result.book.lang).toBe('he')
    const chapter = result.book.body[0]
    if (!chapter || !('html' in chapter)) throw new Error('Expected an imported chapter.')
    expect(chapter.html).toContain('dir="ltr"')
    expect(result.book.css).toContain('.idml-p-body{line-height:18pt}')
    expect(result.report.fonts).toMatchObject([{ appliedFont: 'Hebrew Face' }])
  })

  test('imports applied master furniture and matched body marks from package parts', async () => {
    const map =
      '<Document Self="master-book"><DocumentPreference PageWidth="100" PageHeight="100" FacingPages="true" PageBinding="RightToLeft"/><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/><TextVariable Self="v" Name="Siman" VariableType="MatchCharacterStyleType"><MatchCharacterStylePreference AppliedCharacterStyle="mark" SearchStrategy="FirstOnPage"/></TextVariable><idPkg:Spread src="Spreads/s.xml"/><idPkg:MasterSpread src="MasterSpreads/h.xml"/><idPkg:Styles src="Resources/Styles.xml"/></Document>'
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: map },
      {
        name: 'Spreads/s.xml',
        content: `<Spread Self="s"><Page Self="p" AppliedMaster="h" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 -100 0"/>${frame('body', -100)}</Spread>`,
      },
      {
        name: 'MasterSpreads/h.xml',
        content:
          '<MasterSpread Self="h" NamePrefix="H" BaseName="Book"><Page Self="left" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 -100 0"><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/></Page><Page Self="right" GeometricBounds="0 0 100 100"><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/></Page><TextFrame Self="head" ParentStory="head-story" ItemTransform="1 0 0 1 -100 0"><PathGeometry><PathPointType Anchor="30 2"/><PathPointType Anchor="70 7"/></PathGeometry></TextFrame></MasterSpread>',
      },
      {
        name: 'Resources/Styles.xml',
        content: '<idPkg:Styles><RootCharacterStyleGroup><CharacterStyle Self="mark" Name="Mark"/></RootCharacterStyleGroup></idPkg:Styles>',
      },
      {
        name: 'Stories/body.xml',
        content:
          '<Story Self="body"><ParagraphStyleRange><CharacterStyleRange AppliedCharacterStyle="mark"><Content>Marked</Content></CharacterStyleRange></ParagraphStyleRange></Story>',
      },
      {
        name: 'Stories/head.xml',
        content:
          '<Story Self="head-story"><ParagraphStyleRange><CharacterStyleRange><TextVariableInstance AssociatedTextVariable="v"/></CharacterStyleRange></ParagraphStyleRange></Story>',
      },
    ])
    const result = await importIdml(bytes)
    expect(result.book.parentPages.map((parent) => parent.name)).toEqual(['idml-h-book-recto', 'idml-h-book-verso'])
    expect(result.book.parentPages[0]?.head).toContain('data-motif-name="Siman"')
    expect(result.book.parentPages[0]?.head).toContain('data-motif-which="first"')
    const chapter = result.book.body[0]
    expect(chapter && 'html' in chapter ? chapter.html : '').toContain('<span data-mark="Siman">')
    expect(result.report.unsupportedElements).not.toHaveProperty('master story')
  })

  test('claims opener headers, keeps page art separate, measures RTL, and sanitizes each linked asset once', async () => {
    const openerMap = designmap.replace('PageBinding="LeftToRight"', 'PageBinding="RightToLeft"')
    const polygon = (x: number) =>
      `<Group ItemTransform="2 0 0 2 ${x} 0"><Polygon FillColor="Color/Red" ItemTransform="1 0 0 1 2 3"><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="10 20" LeftDirection="10 20" RightDirection="15 20"/><PathPointType Anchor="30 40" LeftDirection="25 40" RightDirection="30 40"/></PathPointArray></GeometryPathType></PathGeometry></Polygon></Group>`
    const linked = (x: number) =>
      `<Rectangle ItemTransform="1 0 0 1 ${x} 0"><PathGeometry><PathPointType Anchor="40 20"/><PathPointType Anchor="60 40"/></PathGeometry><Image><Link LinkResourceURI="file:/ornament.ai"/></Image></Rectangle>`
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: openerMap.replace('</Document>', '<idPkg:Graphic src="Resources/Graphic.xml"/></Document>') },
      {
        name: 'Spreads/Spread_s.xml',
        content: `<Spread Self="s"><Page Self="p1" GeometricBounds="0 0 100 100"/><Page Self="p2" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/>${frame('header-1', 0)}<TextFrame ParentStory="body-1"><Properties><TextFramePreference TextColumnCount="2"/></Properties><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame>${polygon(0)}${linked(0)}<Rectangle><PathGeometry><PathPointType Anchor="70 20"/><PathPointType Anchor="80 30"/></PathGeometry></Rectangle><Oval><PathGeometry><PathPointType Anchor="80 20"/><PathPointType Anchor="90 30"/></PathGeometry></Oval>${frame('header-2', 100)}<TextFrame ParentStory="body-2" ItemTransform="1 0 0 1 100 0"><Properties><TextFramePreference TextColumnCount="2"/></Properties><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame>${polygon(100)}${linked(100)}</Spread>`,
      },
      { name: 'MasterSpreads/MasterSpread_m.xml', content: '<MasterSpread Self="m"/>' },
      { name: 'Resources/Graphic.xml', content: '<idPkg:Graphic><Color Self="Color/Red" Name="Red" Space="RGB" ColorValue="255 0 0"/></idPkg:Graphic>' },
      { name: 'Stories/body-1.xml', content: '<Story Self="body-1"><ParagraphStyleRange><Content>Body one is longer</Content></ParagraphStyleRange></Story>' },
      { name: 'Stories/header-1.xml', content: '<Story Self="header-1"><ParagraphStyleRange><Content>Header one</Content></ParagraphStyleRange></Story>' },
      { name: 'Stories/body-2.xml', content: '<Story Self="body-2"><ParagraphStyleRange><Content>Body two is longer</Content></ParagraphStyleRange></Story>' },
      { name: 'Stories/header-2.xml', content: '<Story Self="header-2"><ParagraphStyleRange><Content>Header two</Content></ParagraphStyleRange></Story>' },
    ])
    const calls: string[] = []
    const result = await importIdml(bytes, {
      asset(uri) {
        calls.push(uri)
        return '<svg><script>bad()</script><path d="M0 0"/></svg>'
      },
    })
    expect(result.book.body.map((chapter) => chapter.title)).toEqual(['body-1', 'body-2'])
    const first = result.book.body[0]
    const second = result.book.body[1]
    const firstHtml = first && 'html' in first ? first.html : ''
    const secondHtml = second && 'html' in second ? second.html : ''
    expect(firstHtml.startsWith('<div class="idml-title-block"')).toBe(true)
    expect(firstHtml).toContain('Header one')
    expect(firstHtml).not.toContain('Header two')
    expect(secondHtml).toContain('Header two')
    expect(firstHtml).toContain('inset-inline-start:296pt')
    expect(firstHtml).toContain('d="M0 0C10 0 30 40 40 40C40 40 0 0 0 0Z"')
    expect(firstHtml).toContain('<svg><path d="M0 0"/></svg>')
    expect(firstHtml).not.toContain('<script>')
    expect(result.report.strippedAssetContent['file:/ornament.ai']).toEqual(expect.arrayContaining([expect.stringContaining('script')]))
    expect(calls).toEqual(['file:/ornament.ai'])
    expect(result.report.links).toEqual([{ uri: 'file:/ornament.ai', locations: expect.any(Array) }])
    expect(result.report.links[0]?.locations).toHaveLength(2)
    expect(result.report.unsupportedElements).toMatchObject({ Rectangle: 1, Oval: 1 })
  })

  test('keeps an unresolved opener link as an empty sized slot', async () => {
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: designmap },
      {
        name: 'Spreads/Spread_s.xml',
        content: `<Spread Self="s"><Page Self="p" AppliedMaster="m" GeometricBounds="0 0 100 100"/>${frame('body', 0)}<Rectangle><PathGeometry><PathPointType Anchor="20 20"/><PathPointType Anchor="40 40"/></PathGeometry><SVG><Link LinkResourceURI="https://example.invalid/art.svg"/></SVG></Rectangle></Spread>`,
      },
      {
        name: 'MasterSpreads/MasterSpread_m.xml',
        content:
          '<MasterSpread Self="m"><Page Self="mp" GeometricBounds="0 0 100 100"><MarginPreference Top="10" Bottom="10" Left="25" Right="15"/></Page></MasterSpread>',
      },
      { name: 'Stories/body.xml', content: '<Story Self="body"><ParagraphStyleRange><Content>Body</Content></ParagraphStyleRange></Story>' },
    ])
    const result = await importIdml(bytes)
    const chapter = result.book.body[0]
    const html = chapter && 'html' in chapter ? chapter.html : ''
    expect(html).toContain('inset-inline-start:-5pt;inline-size:20pt')
    expect(html).toContain('block-size:20pt"></div>')
    expect(result.report.links[0]?.uri).toBe('https://example.invalid/art.svg')
  })
})
