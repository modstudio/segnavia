import { expect, test } from 'bun:test'
import { Book, Deck, isDesignedSection, isTemplatedSection, Page } from '@segnavia/format'
import { prepareSlots, RequiredSlotsRefusedError, SlotFillRefusedError, SlotFillsConflictError } from '@segnavia/html'
import { filledBook, filledDeck, filledPage, filledPages, preparedSlotsFor } from './slot-fill.ts'

const slots = {
  declarations: [{ key: 'host.name', label: 'Host name', type: 'text' as const, required: true }],
  fill: { id: 'host', values: { 'host.name': 'Filled by host' } },
}

test('filledBook applies host values to chapters, designed pages, templates and regions', async () => {
  const book = Book.parse({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
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
  const filled = await filledBook(book, { fill: { id: 'host', values: { school: 'Lincoln School' } } })
  expect(filled.templates[0]?.html).toContain('Lincoln School')
  const designed = filled.chapters[0]
  const templated = filled.chapters[1]
  const chapter = filled.chapters[2]
  expect(designed !== undefined && isDesignedSection(designed) && designed.pages[0]?.html).toContain('Lincoln School')
  expect(templated !== undefined && isTemplatedSection(templated) && templated.pages[0]?.regions.heading).toContain('Lincoln School')
  expect(chapter !== undefined && 'html' in chapter && chapter.html).toContain('Lincoln School')
})

test('filledBook refuses a missing required slot by name', async () => {
  const book = Book.parse({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    chapters: [{ title: 'One', html: '<p data-slot-value="school">School</p>' }],
  })
  const error = await filledBook(book, { fill: { id: 'host', values: {} } }).catch((caught) => caught)
  expect(error).toBeInstanceOf(RequiredSlotsRefusedError)
  expect(error.message).toContain('"school"')
})

test('a refuse-overflow key bound in two chapters is marked once per book document', async () => {
  const book = Book.parse({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', overflow: 'refuse' }],
    chapters: [
      { title: 'One', html: '<p data-slot-value="school">School</p>' },
      { title: 'Two', html: '<p data-slot-value="school">School</p>' },
    ],
  })
  const fill = { fill: { id: 'host', values: { school: 'Lincoln School' } } }
  const filled = await filledBook(book, fill)
  const chapters = book.chapters.flatMap((entry) => ('html' in entry ? [entry.html] : []))
  const once = await prepareSlots(book.slots, fill)
  once.apply(chapters.join(''))
  expect([...(preparedSlotsFor(filled)?.marked ?? [])]).toEqual([...once.marked])
  expect(preparedSlotsFor(filled)?.marked.get('school')).toBe(1)
})

test('pagePdf, pageImage, pagesPdf, deckPdf and slideImage preparation honor host declarations', async () => {
  const page = Page.parse({ html: '<p data-slot-value="host.name">Design text</p>' })
  const filledPageResult = await filledPage(page, slots)
  expect(filledPageResult.html).toContain('Filled by host')

  const pages = [Page.parse({ html: '<p data-slot-value="host.name">Front</p>' }), Page.parse({ html: '<p data-slot-value="host.name">Back</p>' })]
  const filledCollection = await filledPages(pages, slots)
  expect(filledCollection.map((item) => item.html)).toEqual(['<p dir="auto">Filled by host</p>', '<p dir="auto">Filled by host</p>'])

  const deck = Deck.parse({
    title: 'Host slots',
    size: { width: 400, height: 200 },
    slides: [{ id: 'one', content: { kind: 'html', html: '<p data-slot-value="host.name">Design text</p>' } }],
  })
  const filledDeckResult = await filledDeck(deck, slots)
  expect(filledDeckResult.slides[0]?.content).toEqual({ kind: 'html', html: '<p dir="auto">Filled by host</p>' })
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
  expect((await filledPage(page, { fill: { id: 'host', values: { 'host.name': 'Private value' } } })).html).toContain('Private value')
})

test('server preparation reports placeholders for scripted items without a fill', async () => {
  const reports: unknown[] = []
  const page = Page.parse({
    html: '<p data-slot-value="name">Design text</p>',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text', required: false, placeholder: 'Placeholder' }],
  })
  const result = await filledPage(page, { report: (report) => reports.push(report) })
  expect(result.html).toContain('Placeholder')
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
