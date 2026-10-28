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
          '<?xml version="1.0"?><idPkg:Document xmlns:idPkg="urn:idml" Self="doc"><DocumentPreference PageWidth="396" PageHeight="612" FacingPages="true" PageBinding="RightToLeft"/><MarginPreference Top="36" Bottom="37" Left="38" Right="39"/><idPkg:Story src="Stories/Story_second.xml"/></idPkg:Document>',
        ),
      },
      {
        name: 'Spreads/Spread_one.xml',
        bytes: bytes(
          '<Spread Self="spread"><Page Self="page-1" AppliedMaster="master"><TextFrame ParentStory="first"/></Page><Page Self="page-2"/><TextFrame ParentPage="page-2" ParentStory="second"/><Polygon/></Spread>',
        ),
      },
      { name: 'MasterSpreads/MasterSpread_master.xml', bytes: bytes('<MasterSpread Self="master"><Page Self="master-page"/></MasterSpread>') },
      { name: 'Stories/Story_second.xml', bytes: bytes('<Story Self="second"><ParagraphStyleRange/></Story>') },
      { name: 'Stories/Story_first.xml', bytes: bytes('<Story Self="first"/>') },
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
    expect(model.unsupportedElements).toMatchObject({ Story: 3, MasterSpread: 1, Polygon: 1, ParagraphStyleRange: 1 })
  })

  test('refuses XML beyond the named depth cap', () => {
    expect(() =>
      idmlModel([{ name: 'designmap.xml', bytes: bytes('<Document><DocumentPreference PageWidth="1" PageHeight="1"/><a><b/></a></Document>') }], {
        ...IDML_LIMITS,
        xmlDepth: 2,
      }),
    ).toThrow('XML depth limit')
  })
})
