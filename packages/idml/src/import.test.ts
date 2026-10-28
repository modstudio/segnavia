import { describe, expect, test } from 'bun:test'
import { importIdml } from './import.ts'
import { testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'
const designmap =
  '<Document Self="sample"><DocumentPreference PageWidth="396" PageHeight="612" FacingPages="true" PageBinding="LeftToRight"/><MarginPreference Top="36" Bottom="36" Left="36" Right="36"/></Document>'

describe('importIdml', () => {
  test('validates and imports an IDML package end to end', async () => {
    const bytes = await testZip([
      { name: 'mimetype', content: mimetype },
      { name: 'designmap.xml', content: designmap, method: 8 },
      { name: 'Spreads/Spread_s.xml', content: '<Spread Self="s"><Page Self="p"><TextFrame ParentStory="story"/></Page></Spread>' },
      { name: 'Stories/Story_story.xml', content: '<Story Self="story"><Content>ignored in this slice</Content></Story>' },
    ])
    const result = await importIdml(bytes)
    expect(result.book.chapters).toEqual([expect.objectContaining({ title: 'story', html: '<p></p>' })])
    expect(result.report.partsRead).toEqual(['mimetype', 'designmap.xml', 'Spreads/Spread_s.xml', 'Stories/Story_story.xml'])
    expect(result.report.unsupportedElements).toMatchObject({ Story: 1, Content: 1 })
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
})
