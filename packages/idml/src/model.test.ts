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
    expect(model.masterSpreads[0]?.pages[0]?.frames).toEqual([
      { id: 'master-story', story: 'master-story', bounds: { left: 20, top: 10, width: 10, height: 10 } },
    ])
    expect(model.masterStoryIds).toEqual(['master-story'])
    expect(model.report?.unsupportedElements).not.toHaveProperty('Polygon')
    expect(model.report?.unsupportedElements).not.toHaveProperty('Story')
    expect(model.report?.unsupportedElements).not.toHaveProperty('MasterSpread')
    expect(model.report?.unsupportedElements).not.toHaveProperty('Group')
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
    expect(model.report?.unsupportedElements['unlisted spread part']).toBe(1)
  })

  test('selects a story frame from its most common multi-column preference', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes(
          '<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/><idPkg:Spread src="Spreads/body.xml"/><idPkg:Story src="Stories/story.xml"/></Document>',
        ),
      },
      {
        name: 'Spreads/body.xml',
        bytes: bytes(
          '<Spread Self="body"><Page Self="page" GeometricBounds="0 0 100 100"/><TextFrame ParentStory="story"><Properties><TextFramePreference TextColumnCount="1" TextColumnGutter="0"/></Properties></TextFrame><TextFrame ParentStory="story"><Properties><TextFramePreference TextColumnCount="2" TextColumnGutter="14"/></Properties></TextFrame><TextFrame ParentStory="story"><Properties><TextFramePreference TextColumnCount="2" TextColumnGutter="12"/></Properties></TextFrame><TextFrame ParentStory="story"><Properties><TextFramePreference TextColumnCount="2" TextColumnGutter="12"/></Properties></TextFrame></Spread>',
        ),
      },
      { name: 'Stories/story.xml', bytes: bytes('<Story Self="story"/>') },
    ])
    expect(model.stories[0]?.frame).toMatchObject({ columns: 2, gutter: 12 })
    expect(model.bodyFramePreferences).toHaveLength(3)
  })

  test('reads direction from StoryPreference and reports its active unmapped settings', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes('<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/></Document>'),
      },
      {
        name: 'Stories/story.xml',
        bytes: bytes(
          '<Story Self="story" StoryDirection="RightToLeftDirection"><StoryPreference StoryDirection="lefttorightdirection" OpticalMarginAlignment="true" OpticalMarginSize="0"/></Story>',
        ),
      },
    ])
    expect(model.stories[0]?.direction).toBe('ltr')
    expect(model.report?.unsupportedElements).toMatchObject({ 'StoryPreference:OpticalMarginAlignment': 1 })
    expect(model.report?.unsupportedElements).not.toHaveProperty('StoryPreference:OpticalMarginSize')
  })

  test('censuses unmapped style and graphic resource siblings', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes('<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/></Document>'),
      },
      {
        name: 'Resources/Styles.xml',
        bytes: bytes(
          '<idPkg:Styles><RootParagraphStyleGroup><ParagraphStyle Self="p"><Properties><Leading>12</Leading></Properties></ParagraphStyle></RootParagraphStyleGroup><ObjectStyle/><TableStyle/><CellStyle/></idPkg:Styles>',
        ),
      },
      {
        name: 'Resources/Graphic.xml',
        bytes: bytes('<idPkg:Graphic><Color Self="c"/><Gradient/><Tint/><MixedInk/><StrokeStyle/></idPkg:Graphic>'),
      },
    ])
    expect(model.report?.unsupportedElements).toMatchObject({
      ObjectStyle: 1,
      TableStyle: 1,
      CellStyle: 1,
      Gradient: 1,
      Tint: 1,
      MixedInk: 1,
      StrokeStyle: 1,
    })
    expect(model.report?.unsupportedElements).not.toHaveProperty('Leading')
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

  test('refuses a malformed text column count by its property name', () => {
    expect(() =>
      idmlModel([
        {
          name: 'designmap.xml',
          bytes: bytes('<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100"/><idPkg:Spread src="Spreads/s.xml"/></Document>'),
        },
        {
          name: 'Spreads/s.xml',
          bytes: bytes('<Spread Self="s"><Page Self="p"/><TextFrame ParentStory="story"><TextFramePreference TextColumnCount="many"/></TextFrame></Spread>'),
        },
      ]),
    ).toThrow('TextColumnCount')
  })

  test('keeps master names, sides, margins, frames, bases, and text variables', () => {
    const model = idmlModel([
      {
        name: 'designmap.xml',
        bytes: bytes(
          '<Document Self="doc"><DocumentPreference PageWidth="100" PageHeight="100" PageBinding="RightToLeft"/><TextVariable Self="v" Name="Siman" VariableType="MatchCharacterStyleType"><MatchCharacterStylePreference AppliedCharacterStyle="CharacterStyle/Mark" SearchStrategy="LastOnPage"/></TextVariable><idPkg:MasterSpread src="MasterSpreads/h.xml"/></Document>',
        ),
      },
      {
        name: 'MasterSpreads/h.xml',
        bytes: bytes(
          '<MasterSpread Self="h" NamePrefix="H" BaseName="Book" BasedOn="base"><Page Self="left" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 -100 0"><MarginPreference Top="10" Bottom="11" Left="12" Right="13"/></Page><Page Self="right" GeometricBounds="0 0 100 100"><MarginPreference Top="20" Bottom="21" Left="22" Right="23"/></Page><TextFrame Self="head" ParentStory="running" ItemTransform="1 0 0 1 -100 0"><PathGeometry><PathPointType Anchor="10 2"/><PathPointType Anchor="30 7"/></PathGeometry></TextFrame></MasterSpread>',
        ),
      },
      { name: 'Stories/r.xml', bytes: bytes('<Story Self="running"/>') },
    ])
    expect(model.masterSpreads[0]).toMatchObject({
      id: 'h',
      name: 'H-Book',
      basedOn: 'base',
      pages: [
        {
          side: 'left',
          margin: { top: 10, bottom: 11, left: 12, right: 13 },
          frames: [{ id: 'head', story: 'running', bounds: { left: 10, top: 2, width: 20, height: 5 } }],
        },
        { side: 'right', margin: { top: 20, bottom: 21, left: 22, right: 23 } },
      ],
    })
    expect(model.textVariables).toEqual([
      {
        id: 'v',
        name: 'Siman',
        type: 'MatchCharacterStyleType',
        appliedCharacterStyle: 'CharacterStyle/Mark',
        searchStrategy: 'LastOnPage',
        location: 'designmap.xml#v',
      },
    ])
  })
})
