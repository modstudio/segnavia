import { expect, test } from 'bun:test'
import { Book, Deck, isDesignedSection, isTemplatedSection, Page } from '@segnavia/format'
import { bookDocument, parseBookFixture, RequiredSlotsRefusedError, resolvePrintedPageHtml, SlotFillRefusedError, SlotFillsConflictError } from '@segnavia/html'
import { renderPagePdf } from './page-render.ts'
import { filledBook, filledDeck, filledPage, filledPages } from './slot-fill.ts'

const slots = {
  declarations: [{ key: 'host.name', label: 'Host name', type: 'text' as const, required: true }],
  fill: { id: 'host', values: { 'host.name': 'Filled by host' } },
}

test('filledBook applies host values to chapters, designed pages, templates and regions', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    templates: [{ name: 'lesson', html: '<p data-slot-value="school">School</p><div data-region="heading"></div>' }],
    chapters: [
      { kind: 'designed', pages: [{ html: '<p data-slot-value="school">School</p>' }] },
      {
        kind: 'templated',
        template: 'lesson',
        pages: [{ regions: { heading: '<h1 data-slot-value="school">School</h1>' } }],
      },
      { title: 'One', html: '<p data-slot-value="school">School</p>' },
    ],
  })
  const { value: filled } = await filledBook(book, { fill: { id: 'host', values: { school: 'Lincoln School' } } })
  expect(filled.templates[0]?.html).toContain('Lincoln School')
  const designed = filled.body[0]
  const templated = filled.body[1]
  const chapter = filled.body[2]
  expect(designed !== undefined && isDesignedSection(designed) && designed.pages[0]?.html).toContain('Lincoln School')
  expect(templated !== undefined && isTemplatedSection(templated) && templated.pages[0]?.regions.heading).toContain('Lincoln School')
  expect(chapter !== undefined && 'html' in chapter && chapter.html).toContain('Lincoln School')
})

test('filledBook applies host values to a part opening and its nested chapter', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'continuous',
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    body: [
      {
        name: 'part',
        html: '<p data-slot-value="school">Part school</p>',
        children: [{ title: 'One', html: '<p data-slot-value="school">Chapter school</p>' }],
      },
    ],
  })
  const { value: filled } = await filledBook(book, { fill: { id: 'host', values: { school: 'Lincoln School' } } })
  const part = filled.body[0]
  const nested = part !== undefined && 'name' in part ? part.children[0] : undefined
  expect(part !== undefined && 'name' in part && part.html).toContain('Lincoln School')
  expect(nested !== undefined && 'html' in nested && nested.html).toContain('Lincoln School')
})

test('filledBook binds a chapter record once before applying host slots', async () => {
  const book = Book.parse({
    title: 'Records',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    slots: [{ key: 'host.name', label: 'Host name', type: 'text' }],
    body: [
      {
        id: 'one',
        title: 'One',
        html: '<p data-slot-value="record.name"></p><p data-slot-value="host.name"></p>',
        values: { 'record.name': 'Ada' },
        record: { index: 1, count: 1 },
        recordTemplate: { name: 'row', slots: [{ key: 'record.name', label: 'Name', type: 'text' }] },
      },
    ],
  })
  const { value } = await filledBook(book, { fill: { id: 'host', values: { 'host.name': 'School' } } })
  const chapter = value.body[0]

  expect(chapter && 'values' in chapter ? chapter.values : undefined).toBeUndefined()
  expect(() => bookDocument(value)).not.toThrow()
})

test('filledBook refuses a missing required slot by name', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    chapters: [{ title: 'One', html: '<p data-slot-value="school">School</p>' }],
  })
  const error = await filledBook(book, { fill: { id: 'host', values: {} } }).catch((caught) => caught)
  expect(error).toBeInstanceOf(RequiredSlotsRefusedError)
  expect(error.message).toContain('"school"')
})

test('filledBook keeps one slot frame per applied field', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', overflow: 'refuse' }],
    chapters: [
      { title: 'One', html: '<p data-slot-value="school">School</p>' },
      { title: 'Two', html: '<p data-slot-value="school">School</p>' },
    ],
  })
  const fill = { fill: { id: 'host', values: { school: 'Lincoln School' } } }
  const filled = await filledBook(book, fill)
  expect(filled.slots.frames.map((frame) => [...frame])).toEqual([[['school', 1]], [['school', 1]]])
  expect(filled.slots.marked.get('school')).toBe(2)
})

test('a structurally cloned filled value renders with its explicit slots', async () => {
  const page = Page.parse({
    html: '<p data-slot-value="name">Name</p>',
    slots: [{ key: 'name', label: 'Name', type: 'text', overflow: 'refuse' }],
  })
  const result = await filledPage(page, { fill: { id: 'host', values: { name: 'Ada' } } })
  const cloned = structuredClone(result.value)
  let renderedSlots: unknown
  const rendered = renderPagePdf(
    cloned,
    result.slots,
    {},
    {
      withTab: async (setup) => {
        renderedSlots = setup.slots
        throw new Error('stop after setup')
      },
    },
  )
  await expect(rendered).rejects.toThrow('stop after setup')
  expect(cloned.html).toContain('Ada')
  expect(result.slots.marked.get('name')).toBe(1)
  expect(renderedSlots).toBe(result.slots)
})

test('pagePdf, pageImage, pagesPdf, deckPdf and slideImage preparation honor host declarations', async () => {
  const page = Page.parse({ html: '<p data-slot-value="host.name">Design text</p>' })
  const { value: filledPageResult } = await filledPage(page, slots)
  expect(filledPageResult.html).toContain('Filled by host')

  const pages = [Page.parse({ html: '<p data-slot-value="host.name">Front</p>' }), Page.parse({ html: '<p data-slot-value="host.name">Back</p>' })]
  const { value: filledCollection } = await filledPages(pages, slots)
  expect(filledCollection.map((item) => item.html)).toEqual(['<p dir="auto">Filled by host</p>', '<p dir="auto">Filled by host</p>'])

  const deck = Deck.parse({
    title: 'Host slots',
    size: { width: 400, height: 200 },
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="host.name">Design text</p>' } }],
  })
  const { value: filledDeckResult } = await filledDeck(deck, slots)
  expect(filledDeckResult.slides[0]?.content).toEqual({ kind: 'html', html: '<p dir="auto">Filled by host</p>' })
})

test('sectioned printed pages fill every section and refuse multiple copies', async () => {
  const page = resolvePrintedPageHtml(
    Page.parse({
      scripts: 'refuse',
      print: { paper: 'letter' },
      slots: [{ key: 'name', label: 'Name', type: 'text' }],
      printedPages: {
        parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
        parentRules: [{ parent: 'body' }],
        sections: [
          { id: 'one', html: '<p data-slot-value="name">One</p>' },
          { id: 'two', html: '<p data-slot-value="name">Two</p>' },
        ],
      },
    }),
  )
  const fill = { fill: { id: 'host', values: { name: 'Ada' } } }
  const { value, slots: prepared } = await filledPage(page, fill)
  expect(value.printedPages.sections.map((section) => section.html)).toEqual(['<p dir="auto">Ada</p>', '<p dir="auto">Ada</p>'])
  expect(prepared.frames).toHaveLength(2)
  await expect(filledPage(page, { fills: [fill, fill] })).rejects.toThrow('Pass fill or source for a single copy')
})

test('record values bind before a different host slot fill', async () => {
  const page = resolvePrintedPageHtml(
    Page.parse({
      scripts: 'refuse',
      print: { paper: 'letter' },
      slots: [{ key: 'host.name', label: 'Host name', type: 'text' }],
      printedPages: {
        parents: [{ name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }],
        parentRules: [{ parent: 'body' }],
        sections: [
          {
            id: 'record',
            html: '<p data-slot-value="record.name"></p><p data-slot-value="host.name"></p>',
            values: { 'record.name': 'Ada' },
            record: { index: 1, count: 1 },
            recordTemplate: { name: 'row', slots: [{ key: 'record.name' }] },
          },
        ],
      },
    }),
  )
  const { value } = await filledPage(page, { fill: { id: 'host', values: { 'host.name': 'School' } } })
  expect(value.printedPages.sections[0]?.html).toBe('<p dir="auto">Ada</p><p dir="auto">School</p>')
  expect(value.printedPages.sections[0]?.values).toBeUndefined()
})

test('filledDeck aligns slot measurement frames with non-HTML slides', async () => {
  const deck = Deck.parse({
    title: 'Aligned slot frames',
    size: { width: 400, height: 200 },
    slots: [{ key: 'name', label: 'Name', type: 'text', overflow: 'refuse' }],
    slides: [
      { id: 'image', content: { kind: 'image', src: 'image.png', alt: 'Image' } },
      { id: 'html', content: { kind: 'html', html: '<p data-slot-value="name">Name</p>' } },
    ],
  })

  const { slots: prepared } = await filledDeck(deck, { fill: { id: 'host', values: { name: 'Ada' } } })

  expect(prepared.frames.map((frame) => [...frame])).toEqual([[], [['name', 1]]])
})

test('asset resolution receives the render abort signal', async () => {
  const controller = new AbortController()
  let received: AbortSignal | undefined
  const page = Page.parse({
    html: '<img data-slot-src="logo">',
    slots: [{ key: 'logo', label: 'Logo', type: 'image', required: false }],
  })
  await filledPage(
    page,
    {
      fill: { id: 'host', values: { logo: { asset: 'logo' } } },
      resolveAsset: async (_, options) => {
        received = options.signal
        return 'data:image/png;base64,AAAA'
      },
    },
    controller.signal,
  )
  expect(received).toBe(controller.signal)
})

test('server preparation refuses fills for scripted items before reporting or resolving assets', async () => {
  let reports = 0
  let resolutions = 0
  const page = Page.parse({
    html: '<p data-slot-value="host.name">Design text</p>',
    scripts: 'sandboxed',
    slots: [{ key: 'host.name', label: 'Name', type: 'text', required: false }],
  })
  const options = {
    fill: { id: 'host', values: { 'host.name': 'Private value' } },
    report: () => reports++,
    resolveAsset: async () => {
      resolutions++
      return 'data:image/png;base64,AAAA'
    },
  }
  await expect(filledPage(page, options)).rejects.toBeInstanceOf(SlotFillRefusedError)
  expect(reports).toBe(0)
  expect(resolutions).toBe(0)
})

test('server preparation still fills items whose scripts are refused', async () => {
  const page = Page.parse({
    html: '<p data-slot-value="host.name">Design text</p>',
    scripts: 'refuse',
    slots: [{ key: 'host.name', label: 'Name', type: 'text', required: false }],
  })
  expect((await filledPage(page, { fill: { id: 'host', values: { 'host.name': 'Private value' } } })).value.html).toContain('Private value')
})

test('server preparation reports placeholders for scripted items without a fill', async () => {
  const reports: unknown[] = []
  const page = Page.parse({
    html: '<p data-slot-value="name">Design text</p>',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text', required: false, placeholder: 'Placeholder' }],
  })
  const result = await filledPage(page, { report: (report) => reports.push(report) })
  expect(result.value.html).toContain('Placeholder')
  expect(reports).toEqual([{ fill: null, slots: { name: 'placeholder' }, origins: {} }])
})

test('server preparation rejects unsafe bindings for scripted items without a fill', async () => {
  const page = Page.parse({
    html: '<style data-slot-value="name">Design text</style>',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text', required: false }],
  })
  await expect(filledPage(page, undefined)).rejects.toThrow('Slot "name" uses a value binding on <style>')
})

test('server render preparation refuses all unfilled required slots and accepts filled required slots', async () => {
  const page = Page.parse({
    html: '<p data-slot-value="name">Name</p>',
    slots: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Preview' },
      { key: 'email', label: 'Email', type: 'email', required: true },
      { key: 'site', label: 'Site', type: 'link', required: true },
    ],
  })
  const refused = filledPage(page, { fill: { id: 'x', values: { email: 'invalid', site: 'ftp://example.com' } } })
  await expect(refused).rejects.toBeInstanceOf(RequiredSlotsRefusedError)
  await expect(refused).rejects.toThrow('"name" (placeholder), "email" (invalid), "site" (invalid)')
  await expect(filledPage(page, { fill: { id: 'x', values: { name: 'Ada', email: 'ada@example.com', site: 'https://example.com' } } })).resolves.toBeDefined()
})

test('a single-copy fill refuses fills together with fill', async () => {
  const page = Page.parse({ html: '<p>Design</p>' })
  await expect(filledPage(page, { fills: [{ fill: { id: 'ada', values: {} } }], fill: { id: 'ada', values: {} } })).rejects.toBeInstanceOf(
    SlotFillsConflictError,
  )
})
