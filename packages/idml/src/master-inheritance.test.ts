import { expect, test } from 'bun:test'
import { importIdml } from './import.ts'
import { type TestZipEntry, testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'

function page(id: string, x: number, appliedMaster?: string, showMasterItems?: boolean): string {
  const applied = appliedMaster ? ` AppliedMaster="${appliedMaster}"` : ''
  const show = showMasterItems === false ? ' ShowMasterItems="false"' : ''
  return `<Page Self="${id}"${applied}${show} GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 ${x} 0"><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/></Page>`
}

function headFrame(id: string, story: string, x: number): string {
  return `<TextFrame Self="${id}" ParentStory="${story}" ItemTransform="1 0 0 1 ${x} 0"><PathGeometry><PathPointType Anchor="20 2"/><PathPointType Anchor="80 8"/></PathGeometry></TextFrame>`
}

function story(id: string, text: string, folio = false): TestZipEntry {
  const marker = folio ? '<?ACE 18?>' : ''
  return {
    name: `Stories/${id}.xml`,
    content: `<Story Self="${id}"><ParagraphStyleRange><CharacterStyleRange><Content>${text}</Content>${marker}</CharacterStyleRange></ParagraphStyleRange></Story>`,
  }
}

async function masterPackage(masters: { id: string; xml: string }[], applied: string, stories: TestZipEntry[]): Promise<Uint8Array> {
  const masterSources = masters.map(({ id }) => `<idPkg:MasterSpread src="MasterSpreads/${id}.xml"/>`).join('')
  const designmap = `<Document Self="masters"><DocumentPreference PageWidth="100" PageHeight="100" FacingPages="true" PageBinding="LeftToRight"/><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/><idPkg:Spread src="Spreads/body.xml"/>${masterSources}</Document>`
  return testZip([
    { name: 'mimetype', content: mimetype },
    { name: 'designmap.xml', content: designmap },
    {
      name: 'Spreads/body.xml',
      content: `<Spread Self="body">${page('body-left', 0, applied)}${page('body-right', 100, applied)}${headFrame('body-frame', 'body-story', 0)}</Spread>`,
    },
    ...masters.map(({ id, xml }) => ({ name: `MasterSpreads/${id}.xml`, content: xml })),
    story('body-story', 'Body'),
    ...stories,
  ])
}

const baseMaster = {
  id: 'base',
  xml: `<MasterSpread Self="base" Name="Base">${page('base-left', 0)}${page('base-right', 100)}${headFrame('base-left-frame', 'base-left-story', 0)}${headFrame('base-right-frame', 'base-right-story', 100)}</MasterSpread>`,
}

const baseStories = [story('base-left-story', 'Base verso', true), story('base-right-story', 'Base recto', true)]

test('composes matching page-level base folios below a master own marks', async () => {
  const child = {
    id: 'child',
    xml: `<MasterSpread Self="child" Name="Child">${page('child-left', 0, 'base')}${page('child-right', 100, 'base')}${headFrame('child-left-frame', 'child-left-story', 0)}${headFrame('child-right-frame', 'child-right-story', 100)}</MasterSpread>`,
  }
  const result = await importIdml(
    await masterPackage([baseMaster, child], 'child', [...baseStories, story('child-left-story', 'Own verso'), story('child-right-story', 'Own recto')]),
  )
  expect(result.book.parentPages.map((parent) => parent.name)).toEqual(['idml-child-recto', 'idml-child-verso'])
  const recto = result.book.parentPages[0]?.head ?? ''
  const verso = result.book.parentPages[1]?.head ?? ''
  expect(recto).toContain('data-motif="segnavia:folio"')
  expect(recto).toContain('Base recto')
  expect(recto).not.toContain('Base verso')
  expect(recto.indexOf('Base recto')).toBeLessThan(recto.indexOf('Own recto'))
  expect(verso).toContain('Base verso')
  expect(verso).not.toContain('Base recto')
  expect(verso.indexOf('Base verso')).toBeLessThan(verso.indexOf('Own verso'))
  expect(result.report.unsupportedElements).not.toHaveProperty('master story')
})

test('suppresses inherited master items when the master spread or page disables them', async () => {
  const hidden = {
    id: 'hidden',
    xml: `<MasterSpread Self="hidden" Name="Hidden" ShowMasterItems="false">${page('hidden-left', 0, 'base')}${page('hidden-right', 100, 'base')}${headFrame('hidden-left-frame', 'hidden-left-story', 0)}${headFrame('hidden-right-frame', 'hidden-right-story', 100)}</MasterSpread>`,
  }
  const result = await importIdml(
    await masterPackage([baseMaster, hidden], 'hidden', [...baseStories, story('hidden-left-story', 'Own verso'), story('hidden-right-story', 'Own recto')]),
  )
  const heads = result.book.parentPages.map((parent) => parent.head ?? '').join('')
  expect(heads).toContain('Own recto')
  expect(heads).toContain('Own verso')
  expect(heads).not.toContain('Base recto')
  expect(heads).not.toContain('Base verso')
  expect(heads).not.toContain('data-motif="segnavia:folio"')

  const pageHidden = {
    id: 'page-hidden',
    xml: `<MasterSpread Self="page-hidden" Name="Page Hidden">${page('page-hidden-left', 0, 'base', false)}${page('page-hidden-right', 100, 'base', false)}${headFrame('page-hidden-left-frame', 'hidden-left-story', 0)}${headFrame('page-hidden-right-frame', 'hidden-right-story', 100)}</MasterSpread>`,
  }
  const pageResult = await importIdml(
    await masterPackage([baseMaster, pageHidden], 'page-hidden', [
      ...baseStories,
      story('hidden-left-story', 'Own verso'),
      story('hidden-right-story', 'Own recto'),
    ]),
  )
  expect(pageResult.book.parentPages.map((parent) => parent.head ?? '').join('')).not.toContain('Base')
})

test('reports a page-level master base cycle and stops recursion', async () => {
  const first = {
    id: 'first',
    xml: `<MasterSpread Self="first" Name="First">${page('first-page', 0, 'second')}${headFrame('first-frame', 'first-story', 0)}</MasterSpread>`,
  }
  const second = {
    id: 'second',
    xml: `<MasterSpread Self="second" Name="Second">${page('second-page', 0, 'first')}${headFrame('second-frame', 'second-story', 0)}</MasterSpread>`,
  }
  const result = await importIdml(await masterPackage([first, second], 'first', [story('first-story', 'First'), story('second-story', 'Second')]))
  expect(result.book.parentPages[0]?.head).toContain('First')
  expect(result.book.parentPages[0]?.head).toContain('Second')
  expect(result.report.unsupportedElements['master base cycle']).toBe(1)
  expect(result.report.locations['element:master base cycle']).toEqual(['Second#second-page'])
})

test('reports and bounds an overly deep master base chain', async () => {
  const masters = Array.from({ length: 10 }, (_, index) => {
    const id = `depth-${index}`
    const base = index < 9 ? `depth-${index + 1}` : undefined
    return {
      id,
      xml: `<MasterSpread Self="${id}" Name="Depth ${index}">${page(`${id}-page`, 0, base)}${headFrame(`${id}-frame`, `${id}-story`, 0)}</MasterSpread>`,
    }
  })
  const stories = masters.map(({ id }) => story(`${id}-story`, id))
  const result = await importIdml(await masterPackage(masters, 'depth-0', stories))
  expect(result.report.unsupportedElements['master base depth']).toBe(1)
  expect(result.book.parentPages[0]?.head).toContain('depth-0')
  expect(result.book.parentPages[0]?.head).not.toContain('depth-9')
})

test('continues to compose and link a spread-level base', async () => {
  const child = {
    id: 'spread-child',
    xml: `<MasterSpread Self="spread-child" Name="Spread Child" BasedOn="base">${page('spread-left', 0)}${page('spread-right', 100)}${headFrame('spread-left-frame', 'spread-left-story', 0)}${headFrame('spread-right-frame', 'spread-right-story', 100)}</MasterSpread>`,
  }
  const result = await importIdml(
    await masterPackage([baseMaster, child], 'spread-child', [
      ...baseStories,
      story('spread-left-story', 'Own verso'),
      story('spread-right-story', 'Own recto'),
    ]),
  )
  expect(result.book.parentPages.map((parent) => parent.name)).toEqual([
    'idml-base-recto',
    'idml-base-verso',
    'idml-spread-child-recto',
    'idml-spread-child-verso',
  ])
  expect(result.book.parentPages[2]?.basedOn).toBe('idml-base-recto')
  const head = result.book.parentPages[2]?.head ?? ''
  expect(head.indexOf('Base recto')).toBeLessThan(head.indexOf('Own recto'))
})
