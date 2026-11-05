import { expect, test } from 'bun:test'
import { idmlFindings } from './findings.ts'
import { idmlModel } from './model.ts'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

test('finds pages, master use, sections, and paragraph style page use as plain data', () => {
  const model = idmlModel([
    { name: 'designmap.xml', bytes: bytes('<Document><DocumentPreference PageWidth="100" PageHeight="100"/><Section Self="front" Name="Front" PageStart="p1"/><Section Self="body" Name="Body" PageStart="p2"/><idPkg:Spread src="Spreads/s.xml"/><idPkg:MasterSpread src="MasterSpreads/m.xml"/></Document>') },
    { name: 'Spreads/s.xml', bytes: bytes('<Spread Self="s"><Page Self="p1" Name="I" AppliedMaster="a" GeometricBounds="0 0 100 100"/><Page Self="p2" Name="1" AppliedMaster="b" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/><TextFrame ParentStory="one"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame><TextFrame ParentStory="two" ItemTransform="1 0 0 1 100 0"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathGeometry></TextFrame></Spread>') },
    { name: 'MasterSpreads/m.xml', bytes: bytes('<MasterSpread Self="a" Name="A"/><MasterSpread Self="b" Name="B"/>') },
    { name: 'Stories/one.xml', bytes: bytes('<Story Self="one"><ParagraphStyleRange AppliedParagraphStyle="heading"><Content>One</Content></ParagraphStyleRange><ParagraphStyleRange AppliedParagraphStyle="body"/></Story>') },
    { name: 'Stories/two.xml', bytes: bytes('<Story Self="two"><ParagraphStyleRange AppliedParagraphStyle="other"/></Story>') },
    { name: 'Resources/Styles.xml', bytes: bytes('<idPkg:Styles><ParagraphStyle Self="heading" Name="Heading"/><ParagraphStyle Self="body" Name="Body"/><ParagraphStyle Self="other" Name="Other"/></idPkg:Styles>') },
  ])
  const findings = idmlFindings(model)
  expect(JSON.parse(JSON.stringify(findings))).toEqual(findings)
  expect(findings.pages.map(({ name, appliedMaster }) => [name, appliedMaster])).toEqual([['I', 'A'], ['1', 'B']])
  expect(findings.sections).toEqual([{ name: 'Front', startPage: 'I', pages: ['I'] }, { name: 'Body', startPage: '1', pages: ['1'] }])
  expect(findings.paragraphStyles.map((style) => style.name).sort()).toEqual(['Body', 'Heading', 'Other'])
})
