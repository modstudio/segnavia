import { describe, expect, test } from 'bun:test'
import { IDML_LIMITS } from './limits.ts'
import { idmlModel } from './model.ts'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('idmlModel', () => {
  test('reads preferences, page lists, story order facts, and unsupported element counts', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes(
          '<?xml version="1.0"?><idPkg:Document xmlns:idPkg="urn:idml" Self="doc"><DocumentPreference PageWidth="396" PageHeight="612" FacingPages="true" PageBinding="RightToLeft"/><MarginPreference Top="36" Bottom="37" Left="38" Right="39"/><idPkg:Spread src="Spreads/Spread_one.xml"/><idPkg:MasterSpread src="MasterSpreads/MasterSpread_master.xml"/><idPkg:Story src="Stories/Story_second.xml"/></idPkg:Document>',
        ),
      },
      {
        name: 'Spreads/Spread_one.xml',
        bytes: bytes(
          '<Spread Self="spread"><Page Self="page-1" AppliedMaster="master" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 0 0"/><Page Self="page-2" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 100 0"/><TextFrame ParentStory="second" ItemTransform="1 0 0 1 100 0"><PathGeometry><GeometryPathType><PathPointArray><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathPointArray></GeometryPathType></PathGeometry></TextFrame><TextFrame ParentStory="first" ItemTransform="1 0 0 1 0 0"><PathGeometry><GeometryPathType><PathPointArray><PathPointType Anchor="10 10"/><PathPointType Anchor="90 90"/></PathPointArray></GeometryPathType></PathGeometry></TextFrame><Polygon/></Spread>',
        ),
      },
      {
        name: 'MasterSpreads/MasterSpread_master.xml',
        bytes: bytes(
          '<MasterSpread Self="master"><Page Self="master-page" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 0 0"/><Group ItemTransform="1 0 0 1 10 0"><TextFrame ParentStory="master-story" ItemTransform="1 0 0 1 0 0"><PathGeometry><PathPointType Anchor="10 10"/><PathPointType Anchor="20 20"/></PathGeometry></TextFrame></Group></MasterSpread>',
        ),
      },
      { name: 'Stories/Story_second.xml', bytes: bytes('<Story Self="second"><ParagraphStyleRange/></Story>') },
      { name: 'Stories/Story_first.xml', bytes: bytes('<Story Self="first"/>') },
      { name: 'Stories/Story_master.xml', bytes: bytes('<Story Self="master-story"/>') },
    ])
    expect(model.preferences).toEqual({
      pageWidth: 396,
      pageHeight: 612,
      facingPages: true,
      binding: 'right-to-left',
      margin: { top: 36, bottom: 37, left: 38, right: 39 },
    })
    expect(model.spreads[0]?.pages.map((page) => [page.id, page.stories])).toEqual([
      ['page-1', ['first']],
      ['page-2', ['second']],
    ])
    expect(model.masterSpreads[0]?.id).toBe('master')
    expect(model.masterStoryIds).toEqual(['master-story'])
    expect(model.unsupportedElements).toMatchObject({ Polygon: 1, ParagraphStyleRange: 1, 'master story': 1 })
    expect(model.unsupportedElements).not.toHaveProperty('Story')
    expect(model.unsupportedElements).not.toHaveProperty('MasterSpread')
  })

  test('uses design-map order and reports spread parts omitted from the design map', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes(
          '<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/><idPkg:Spread src="Spreads/first.xml"/><idPkg:Spread src="Spreads/second.xml"/></Document>',
        ),
      },
      { name: 'Spreads/second.xml', bytes: bytes('<Spread Self="second"><Page Self="page-2"/></Spread>') },
      { name: 'Spreads/extra.xml', bytes: bytes('<Spread Self="extra"><Page Self="page-extra"/></Spread>') },
      { name: 'Spreads/first.xml', bytes: bytes('<Spread Self="first"><Page Self="page-1"/></Spread>') },
    ])
    expect(model.spreads.map((spread) => spread.id)).toEqual(['first', 'second'])
    expect(model.unsupportedElements['unlisted spread part']).toBe(1)
  })

  test('refuses XML beyond the named depth cap', () => {
    const deeplyNested = `${'<a>'.repeat(1_000_000)}${'</a>'.repeat(1_000_000)}`
    expect(() => idmlModel([{ name: 'designmap.xml', bytes: bytes(deeplyNested) }], IDML_LIMITS)).toThrow('XML depth limit')
  })

  test('refuses invalid UTF-8 by part name', () => {
    expect(() =>
      idmlModel([
        {
          name: 'designmap.xml',
          bytes: bytes('<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/></Document>'),
        },
        { name: 'Stories/broken.xml', bytes: new Uint8Array([0xff]) },
      ]),
    ).toThrow('IDML XML part Stories/broken.xml is not valid UTF-8')
  })
})
