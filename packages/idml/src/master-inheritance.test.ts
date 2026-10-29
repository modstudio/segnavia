import { expect, test } from 'bun:test'
import { importIdml } from './import.ts'
import { type TestZipEntry, testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'

function page(id: string, x: number, appliedMaster?: string, showMasterItems?: boolean, margin = 10): string {
  const applied = appliedMaster ? ` AppliedMaster="${appliedMaster}"` : ''
  const show = showMasterItems === false ? ' ShowMasterItems="false"' : ''
  return `<Page Self="${id}"${applied}${show} GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 ${x} 0"><MarginPreference Top="${margin}" Bottom="${margin}" Left="${margin}" Right="${margin}"/></Page>`
}

function headFrame(id: string, story: string, x: number): string {
  return `<TextFrame Self="${id}" ParentStory="${story}" ItemTransform="1 0 0 1 ${x} 0"><PathGeometry><PathPointType Anchor="20 2"/><PathPointType Anchor="80 8"/></PathGeometry></TextFrame>`
}

function story(id: string, text: string, folio: 'nested' | 'sibling' | false = false): TestZipEntry {
  const content = folio === 'nested' ? `<Content>${text}<?ACE 18?></Content>` : `<Content>${text}</Content>${folio === 'sibling' ? '<?ACE 18?>' : ''}`
  return {
    name: `Stories/${id}.xml`,
    content: `<Story Self="${id}"><ParagraphStyleRange><CharacterStyleRange>${content}</CharacterStyleRange></ParagraphStyleRange></Story>`,
  }
}

async function masterPackage(
  masters: { id: string; xml: string }[],
  applied: string,
  stories: TestZipEntry[],
  bodyShowMasterItems = true,
): Promise<Uint8Array> {
  const masterSources = masters.map(({ id }) => `<idPkg:MasterSpread src="MasterSpreads/${id}.xml"/>`).join('')
  const designmap = `<Document Self="masters"><DocumentPreference PageWidth="100" PageHeight="100" FacingPages="true" PageBinding="LeftToRight"/><MarginPreference Top="10" Bottom="10" Left="10" Right="10"/><idPkg:Spread src="Spreads/body.xml"/>${masterSources}</Document>`
  return testZip([
    { name: 'mimetype', content: mimetype },
    { name: 'designmap.xml', content: designmap },
    {
      name: 'Spreads/body.xml',
      content: `<Spread Self="body">${page('body-left', 0, applied, bodyShowMasterItems)}${page('body-right', 100, applied)}${headFrame('body-frame', 'body-story', 0)}</Spread>`,
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

const baseStories = [story('base-left-story', 'Base verso', 'nested'), story('base-right-story', 'Base recto', 'nested')]

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
      story('base-left-story', 'Base verso', 'sibling'),
      story('base-right-story', 'Base recto', 'sibling'),
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

test('positions inherited boxes against the applying master margins', async () => {
  const wideBase = {
    id: 'wide-base',
    xml: `<MasterSpread Self="wide-base" Name="Wide Base">${page('wide-left', 0, undefined, undefined, 40)}${page('wide-right', 100, undefined, undefined, 40)}${headFrame('wide-left-frame', 'wide-left-story', 0)}${headFrame('wide-right-frame', 'wide-right-story', 100)}</MasterSpread>`,
  }
  const child = {
    id: 'narrow-child',
    xml: `<MasterSpread Self="narrow-child" Name="Narrow Child">${page('narrow-left', 0, 'wide-base')}${page('narrow-right', 100, 'wide-base')}</MasterSpread>`,
  }
  const result = await importIdml(
    await masterPackage([wideBase, child], 'narrow-child', [story('wide-left-story', 'Verso'), story('wide-right-story', 'Recto')]),
  )
  expect(result.book.css).toContain(
    ':where(.idml-master-frame-1){position:absolute;inset-inline-start:3.527778mm;inline-size:21.166667mm;inset-block-start:0.705556mm;block-size:2.116667mm}',
  )
})

test('shadows a spread base when pages apply another master with no head', async () => {
  const empty = {
    id: 'empty',
    xml: `<MasterSpread Self="empty" Name="Empty">${page('empty-left', 0)}${page('empty-right', 100)}</MasterSpread>`,
  }
  const child = {
    id: 'shadow',
    xml: `<MasterSpread Self="shadow" Name="Shadow" BasedOn="base">${page('shadow-left', 0, 'empty')}${page('shadow-right', 100, 'empty')}</MasterSpread>`,
  }
  const result = await importIdml(await masterPackage([baseMaster, empty, child], 'shadow', baseStories))
  const shadow = result.book.parentPages.find((parent) => parent.name === 'idml-shadow-recto')
  expect(shadow?.head).toBe('<div class="idml-master-region"></div>')
  expect(shadow?.head).not.toContain('Base recto')
})

test('shadows a spread base when master items are disabled', async () => {
  const child = {
    id: 'hidden-spread-base',
    xml: `<MasterSpread Self="hidden-spread-base" Name="Hidden Spread Base" BasedOn="base" ShowMasterItems="false">${page('hidden-base-left', 0)}${page('hidden-base-right', 100)}</MasterSpread>`,
  }
  const result = await importIdml(await masterPackage([baseMaster, child], 'hidden-spread-base', baseStories))
  const hidden = result.book.parentPages.find((parent) => parent.name === 'idml-hidden-spread-base-recto')
  expect(hidden?.head).toBe('<div class="idml-master-region"></div>')
  expect(hidden?.head).not.toContain('Base recto')
})

test('reports unknown page-level bases and off-region frames in consumed bases', async () => {
  const unknown = {
    id: 'unknown-child',
    xml: `<MasterSpread Self="unknown-child" Name="Unknown Child">${page('unknown-left', 0, 'missing')}${page('unknown-right', 100, 'missing')}</MasterSpread>`,
  }
  const unknownResult = await importIdml(await masterPackage([unknown], 'unknown-child', []))
  expect(unknownResult.report.unsupportedElements['master base unknown:missing']).toBe(2)
  expect(unknownResult.report.locations['element:master base unknown:missing']).toEqual(['Unknown Child#unknown-right', 'Unknown Child#unknown-left'])

  const offRegionBase = {
    id: 'off-region-base',
    xml: `<MasterSpread Self="off-region-base" Name="Off Region Base">${page('off-base-page', 0)}<TextFrame Self="off-frame" ParentStory="off-story"><PathGeometry><PathPointType Anchor="20 20"/><PathPointType Anchor="80 80"/></PathGeometry></TextFrame></MasterSpread>`,
  }
  const child = {
    id: 'off-child',
    xml: `<MasterSpread Self="off-child" Name="Off Child">${page('off-child-page', 0, 'off-region-base')}</MasterSpread>`,
  }
  const offResult = await importIdml(await masterPackage([offRegionBase, child], 'off-child', [story('off-story', 'Off region')]))
  expect(offResult.report.locations['element:master TextFrame']).toEqual(['Off Region Base#off-frame'])
})

test('reports document pages that disable master items', async () => {
  const result = await importIdml(await masterPackage([baseMaster], 'base', baseStories, false))
  expect(result.report.locations['element:Page ShowMasterItems']).toEqual(['body-left'])
})
