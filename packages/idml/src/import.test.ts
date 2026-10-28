import { describe, expect, test } from 'bun:test'
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
    expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['story', 'later', 'off-page'])
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
    const chapter = result.book.chapters[0]
    if (!chapter || !('html' in chapter)) throw new Error('Expected an imported chapter.')
    expect(result.book).toMatchObject({ dir: 'ltr', lang: 'he', page: { columnGap: 12 * (25.4 / 72) } })
    expect(chapter.html).toContain('class="idml-p-body" dir="rtl" data-columns="2"')
    expect(chapter.html).toContain('&lt;script&gt;שלום')
    expect(result.book.css).toContain('.idml-p-body{font-size:12pt}')
    expect(result.report.fonts).toMatchObject([{ appliedFont: 'Hebrew Face', fontStyle: 'Regular' }])
    expect(result.report.unsupportedElements).toMatchObject({ Table: 1 })
    expect(result.report.unsupportedStyleProperties).toMatchObject({ RuleAbove: 1 })
    expect(result.report.locations['element:Table']).toBeDefined()
  })
})
