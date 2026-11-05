import { expect, test } from 'bun:test'
import { importIdml, inspectIdml } from './import.ts'
import { testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'
const frame = (story: string): string =>
  `<TextFrame ParentStory="${story}"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame>`

async function ambiguousIdml(): Promise<Uint8Array> {
  return testZip([
    { name: 'mimetype', content: mimetype },
    {
      name: 'designmap.xml',
      content:
        '<Document Self="book"><DocumentPreference PageWidth="100" PageHeight="100"/><Section Self="one" Name="One" PageStart="p1"/><Section Self="two" Name="Two" PageStart="p2"/><idPkg:Spread src="Spreads/one.xml"/><idPkg:Spread src="Spreads/two.xml"/><idPkg:Spread src="Spreads/three.xml"/><idPkg:MasterSpread src="MasterSpreads/masters.xml"/><idPkg:Styles src="Resources/Styles.xml"/></Document>',
    },
    {
      name: 'Spreads/one.xml',
      content: `<Spread Self="s1"><Page Self="p1" Name="1" AppliedMaster="open" GeometricBounds="0 0 100 100"/>${frame('one')}</Spread>`,
    },
    {
      name: 'Spreads/two.xml',
      content: `<Spread Self="s2"><Page Self="p2" Name="2" AppliedMaster="open" GeometricBounds="0 0 100 100"/>${frame('two')}</Spread>`,
    },
    {
      name: 'Spreads/three.xml',
      content: `<Spread Self="s3"><Page Self="p3" Name="3" AppliedMaster="body" GeometricBounds="0 0 100 100"/>${frame('three')}</Spread>`,
    },
    {
      name: 'MasterSpreads/masters.xml',
      content:
        '<idPkg:MasterSpreads><MasterSpread Self="open" Name="Open"><Page Self="ol" GeometricBounds="0 0 100 100"/><Page Self="or" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/></MasterSpread><MasterSpread Self="body" Name="Body"><Page Self="bl" GeometricBounds="0 0 100 100"/><Page Self="br" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/></MasterSpread></idPkg:MasterSpreads>',
    },
    {
      name: 'Resources/Styles.xml',
      content: '<idPkg:Styles><ParagraphStyle Self="heading" Name="Heading"/><ParagraphStyle Self="body-style" Name="Body"/></idPkg:Styles>',
    },
    {
      name: 'Stories/one.xml',
      content: '<Story Self="one"><ParagraphStyleRange AppliedParagraphStyle="heading"><Content>First</Content></ParagraphStyleRange></Story>',
    },
    {
      name: 'Stories/two.xml',
      content: '<Story Self="two"><ParagraphStyleRange AppliedParagraphStyle="heading"><Content>Second</Content></ParagraphStyleRange></Story>',
    },
    {
      name: 'Stories/three.xml',
      content: '<Story Self="three"><ParagraphStyleRange AppliedParagraphStyle="body-style"><Content>Third</Content></ParagraphStyleRange></Story>',
    },
  ])
}

test('inspects ambiguity, refuses it by id and labels, then imports answered parts and titles', async () => {
  const bytes = await ambiguousIdml()
  const inspection = await inspectIdml(bytes)
  expect(JSON.parse(JSON.stringify(inspection))).toEqual(inspection)
  expect(inspection.questions[0]?.id).toBe('parts')
  expect(inspection.questions[0]?.candidates.map((candidate) => candidate.label)).toContain('Master Open; Paragraph style Heading; IDML sections')
  await expect(importIdml(bytes)).rejects.toThrow('conversion question "parts" is unanswered')
  const titles = await inspectIdml(bytes, { parts: { master: 'Open' } })
  expect(titles.questions[0]?.id).toBe('titles')
  const result = await importIdml(bytes, { answers: { parts: { master: 'Open' }, titles: { list: ['First part', 'Second part'] } } })
  expect(result.book.body.map((entry) => ('name' in entry ? [entry.name, entry.title, entry.children.length] : []))).toEqual([
    ['part-1', 'First part', 0],
    ['part-2', 'Second part', 1],
  ])
})

test('refuses invalid master, style, page, and title-count answers with file facts', async () => {
  const bytes = await ambiguousIdml()
  await expect(inspectIdml(bytes, { parts: { master: 'Missing' } })).rejects.toThrow('it has "Open", "Body"')
  await expect(inspectIdml(bytes, { parts: { paragraphStyle: 'Missing' } })).rejects.toThrow('it has "Heading", "Body"')
  await expect(inspectIdml(bytes, { parts: { pages: ['missing'] } })).rejects.toThrow('the IDML has "1", "2", "3"')
  await expect(inspectIdml(bytes, { parts: { master: 'Open' }, titles: { paragraphStyle: 'Missing' } })).rejects.toThrow('answer titles with a paragraph style')
  await expect(inspectIdml(bytes, { parts: { master: 'Open' }, titles: { list: ['one'] } })).rejects.toThrow('produces 2 parts')
})

test('refuses malformed answer shapes at the inspection edge', async () => {
  const bytes = await ambiguousIdml()
  await expect(inspectIdml(bytes, { parts: {} } as never)).rejects.toThrow('the parts answer is {}')
  await expect(inspectIdml(bytes, { parts: { masterSpread: 'Open' } } as never)).rejects.toThrow('exactly one of { master: string }')
  await expect(inspectIdml(bytes, { parts: { pages: [] } } as never)).rejects.toThrow('non-empty string[]')
  await expect(inspectIdml(bytes, { parts: { master: 'Open' }, titles: {} } as never)).rejects.toThrow('the titles answer is {}')
  await expect(inspectIdml(bytes, { titles: { firstParagraph: true } } as never)).rejects.toThrow('answer parts before answering titles')
})
