import { describe, expect, test } from 'bun:test'
import { importIdml } from './import.ts'
import { testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'
const map =
  '<Document Self="openers"><DocumentPreference PageWidth="100" PageHeight="100" FacingPages="true" PageBinding="LeftToRight"/><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/><idPkg:Spread src="Spreads/s.xml"/><idPkg:MasterSpread src="MasterSpreads/m.xml"/></Document>'
const page = '<Page Self="p" GeometricBounds="0 0 100 100"/>'
const path =
  '<PathGeometry><GeometryPathType PathOpen="false"><PathPointArray><PathPointType Anchor="20 20" LeftDirection="20 20" RightDirection="20 20"/><PathPointType Anchor="40 40" LeftDirection="40 40" RightDirection="40 40"/></PathPointArray></GeometryPathType></PathGeometry>'
const polygon = `<Group><Polygon FillColor="Swatch/Black">${path}</Polygon></Group>`
const frame = (story: string, top: number, left: number, bottom: number, right: number) =>
  `<TextFrame ParentStory="${story}"><PathGeometry><PathPointType Anchor="${left} ${top}"/><PathPointType Anchor="${right} ${bottom}"/></PathGeometry></TextFrame>`

async function headerFixture(headerFirst: boolean, headerText = 'Head', bodyText = 'A much longer body story') {
  const header = frame('header', 5, 20, 15, 80)
  const body = frame('body', 20, 10, 90, 90)
  return testZip([
    { name: 'mimetype', content: mimetype },
    { name: 'designmap.xml', content: map },
    { name: 'Spreads/s.xml', content: `<Spread Self="s">${page}${headerFirst ? header + body : body + header}${polygon}</Spread>` },
    { name: 'MasterSpreads/m.xml', content: '<MasterSpread Self="m"/>' },
    { name: 'Stories/header.xml', content: `<Story Self="header"><ParagraphStyleRange><Content>${headerText}</Content></ParagraphStyleRange></Story>` },
    { name: 'Stories/body.xml', content: `<Story Self="body"><ParagraphStyleRange><Content>${bodyText}</Content></ParagraphStyleRange></Story>` },
  ])
}

describe('opener selection and placement reporting', () => {
  for (const headerFirst of [true, false]) {
    test(`selects the larger single-column body before claiming its header when the header is ${headerFirst ? 'first' : 'last'}`, async () => {
      const result = await importIdml(await headerFixture(headerFirst))
      expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['body'])
      const chapter = result.book.chapters[0]
      const html = chapter && 'html' in chapter ? chapter.html : ''
      expect(html.startsWith('<div class="idml-title-block"')).toBe(true)
      expect(html).toContain('Head')
      expect(html).toContain('A much longer body story')
    })
  }

  test('does not claim a one-page story that is longer than the selected flow', async () => {
    const result = await importIdml(await headerFixture(true, 'A header candidate longer than body', 'Body'))
    expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['header', 'body'])
  })

  test('reports continuation-page and master placements instead of rendering them', async () => {
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: map },
      {
        name: 'Spreads/s.xml',
        content: `<Spread Self="s"><Page Self="p1" GeometricBounds="0 0 100 100"/><Page Self="p2" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/>${frame('body', 10, 10, 90, 90)}<TextFrame ParentStory="body" ItemTransform="1 0 0 1 100 0"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame><Group ItemTransform="1 0 0 1 100 0"><Polygon FillColor="Swatch/Black">${path}</Polygon></Group></Spread>`,
      },
      {
        name: 'MasterSpreads/m.xml',
        content: `<MasterSpread Self="m"><Page Self="mp" GeometricBounds="0 0 100 100"/><Rectangle>${path}</Rectangle><Group><Polygon FillColor="Swatch/Black">${path}</Polygon></Group></MasterSpread>`,
      },
      { name: 'Stories/body.xml', content: '<Story Self="body"><ParagraphStyleRange><Content>Body continues</Content></ParagraphStyleRange></Story>' },
    ])
    const result = await importIdml(bytes)
    const chapter = result.book.chapters[0]
    const html = chapter && 'html' in chapter ? chapter.html : ''
    expect(html).not.toContain('<svg')
    expect(result.report.unsupportedElements).toMatchObject({ 'polygon art group': 2, Rectangle: 1 })
  })
})
