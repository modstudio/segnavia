import { expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { findActiveContent } from '@segnavia/html'
import { importIdml } from './import.ts'
import { testZip } from './zip.test-helper.ts'

const mimetype = 'application/vnd.adobe.indesign-idml-package'
const path = '<PathGeometry><PathPointType Anchor="0 0"/><PathPointType Anchor="82.456 10.6"/></PathGeometry>'
const paragraph = (content: string) => `<ParagraphStyleRange><CharacterStyleRange>${content}</CharacterStyleRange></ParagraphStyleRange>`
const frame = (story: string, setting = '', extra = '') =>
  `<TextFrame ParentStory="${story}" ${extra}>${setting ? `<Properties><AnchoredObjectSetting ${setting}/></Properties>` : ''}${path}</TextFrame>`
const story = (id: string, content: string) => ({ name: `Stories/Story_${id}.xml`, content: `<Story Self="${id}">${paragraph(content)}</Story>` })

async function imported(stories: { name: string; content: string }[], spreadStories: string[] = ['host'], resources: { name: string; content: string }[] = []) {
  const placed = spreadStories.map((id, index) => `<TextFrame ParentStory="${id}" ItemTransform="1 0 0 1 ${index * 100} 0">${path}</TextFrame>`).join('')
  const pages = spreadStories.map((_, index) => `<Page Self="p${index}" GeometricBounds="0 0 100 100" ItemTransform="1 0 0 1 ${index * 100} 0"/>`).join('')
  return importIdml(
    await testZip([
      { name: 'mimetype', content: mimetype },
      {
        name: 'designmap.xml',
        content:
          '<Document Self="anchored"><DocumentPreference PageWidth="400" PageHeight="600" FacingPages="false"/><MarginPreference Top="20" Bottom="20" Left="20" Right="20"/><idPkg:Spread src="Spreads/Spread_s.xml"/></Document>',
      },
      { name: 'Spreads/Spread_s.xml', content: `<Spread Self="s">${pages}${placed}</Spread>` },
      ...stories,
      ...resources,
    ]),
  )
}

function chapterHtml(result: Awaited<ReturnType<typeof imported>>, title = 'host'): string {
  const chapter = result.book.chapters.find((candidate) => candidate.title === title)
  if (!chapter || !('html' in chapter)) throw new Error(`Expected chapter ${title}.`)
  return chapter.html
}

test('renders an inline anchored story inside its host paragraph and not as a chapter', async () => {
  const result = await imported([
    story('host', `<Content>before</Content>${frame('label')}<Content>after</Content>`),
    story('label', '<Content>inside</Content>'),
  ])
  const html = chapterHtml(result)
  expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['host'])
  expect(html).toContain('before<span class="idml-anchored" style="display:inline-block;inline-size:82.46pt;vertical-align:baseline">')
  expect(html).toContain('<span style="display:block">inside</span></span>after')
  expect(html).not.toContain('<p>inside</p>')
  expect(() => Book.parse(result.book)).not.toThrow()
  expect(findActiveContent(html)).toEqual([])
})

test('reports an AboveLine anchor and does not emit its story', async () => {
  const result = await imported([story('host', `before${frame('aside', 'AnchoredPosition="AboveLine"')}after`), story('aside', '<Content>hidden</Content>')])
  expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['host'])
  expect(chapterHtml(result)).not.toContain('hidden')
  expect(result.report.unsupportedElements['TextFrame anchored:AboveLine']).toBe(1)
  expect(result.report.locations['element:TextFrame anchored:AboveLine']?.[0]).toContain('Stories/Story_host.xml')
})

test('keeps a page-placed anchored story as a chapter and reports the anchoring', async () => {
  const result = await imported([story('host', frame('placed')), story('placed', '<Content>chapter</Content>')], ['host', 'placed'])
  expect(result.book.chapters.map((chapter) => chapter.title)).toEqual(['host', 'placed'])
  expect(chapterHtml(result, 'host')).not.toContain('chapter')
  expect(result.report.unsupportedElements['TextFrame anchored:InlinePosition']).toBe(1)
})

test('maps an anchored frame object-style fill onto its inline box', async () => {
  const result = await imported(
    [story('host', frame('label', '', 'AppliedObjectStyle="ObjectStyle/Label"')), story('label', '<Content>filled</Content>')],
    ['host'],
    [
      {
        name: 'Resources/Styles.xml',
        content: '<idPkg:Styles><RootObjectStyleGroup><ObjectStyle Self="ObjectStyle/Label" FillColor="Color/Red"/></RootObjectStyleGroup></idPkg:Styles>',
      },
      {
        name: 'Resources/Graphic.xml',
        content: '<idPkg:Graphic><Color Self="Color/Red" Name="Red" Model="Process" Space="RGB" ColorValue="240 10 20"/></idPkg:Graphic>',
      },
    ],
  )
  expect(chapterHtml(result)).toContain('background:rgb(240 10 20)')
})

test('bounds nested anchored stories and reports cycles', async () => {
  const result = await imported([
    story('host', frame('one')),
    story('one', frame('two')),
    story('two', `${frame('three')}${frame('one')}`),
    story('three', frame('four')),
    story('four', '<Content>too deep</Content>'),
  ])
  const html = chapterHtml(result)
  expect(html).not.toContain('too deep')
  expect((html.match(/class="idml-anchored"/g) ?? []).length).toBe(3)
  expect(result.report.unsupportedElements['TextFrame anchored:depth']).toBe(1)
  expect(result.report.unsupportedElements['TextFrame anchored:cycle']).toBe(1)
})
