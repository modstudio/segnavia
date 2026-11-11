import { expect, test } from 'bun:test'
import { type Plan, PREFLIGHT_PRESETS, StyleSheet } from '@segnavia/format'
import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import { frameStyleSheets } from '@segnavia/frame/bridge'
import { parseBookFixture } from '@segnavia/html'
import { type PDFArray, type PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { awaitBookComposition, continuousBookNeedsScripts, lastBookPlanText, renderBrowserBookPdf, renderBrowserBookPlan, usesKeepWith } from './book-render.ts'
import { RenderRefusedError } from './errors.ts'

const currentDay = { date: '2026-11-14', zone: 'UTC', kind: 'current' as const }

function planPage(number: number): Plan['pages'][number] {
  return {
    kind: 'body',
    number,
    sequence: 'body',
    flow: 'one',
    role: number === 1 ? 'opener' : 'body',
    windows: [],
    notes: [],
    variables: {},
    blank: false,
    sectionOpening: number === 1,
    parent: number === 1 ? 'segnavia:opener' : 'segnavia:recto',
    face: number % 2 === 1 ? 'recto' : 'verso',
    side: number % 2 === 1 ? 'right' : 'left',
    fingerprint: `page-${number}`,
  }
}

test('book composition reports the bounded preflight once before refusing its error', async () => {
  const reports: unknown[] = []
  const message = 'Shorten region body to clear it.'
  const attribute = JSON.stringify({
    issues: [{ check: 'region-overset', subject: 'x'.repeat(300), message }],
    facts: { pageCount: 1, pages: [{ folio: '1' }], fits: [] },
  })
  const tab = {
    waitForFunction: async () => {},
    evaluate: async (_function: unknown, name: unknown) => (name === PREFLIGHT_ATTRIBUTE ? attribute : null),
  } as never

  await expect(awaitBookComposition(tab, { profile: PREFLIGHT_PRESETS.strict, seed: [], report: (report) => reports.push(report) })).rejects.toThrow(message)
  expect(reports).toHaveLength(1)
  expect((reports[0] as { issues: Array<{ subject: string }> }).issues[0]?.subject).toHaveLength(256)
})

test('enables the continuous print bridge only when markup or a stylesheet declares a keep', () => {
  expect(usesKeepWith('<span style="--segnavia-keep-with:next">1</span> word')).toBe(true)
  expect(usesKeepWith('<p><span class="seif">1</span> word</p>', '.seif{--segnavia-keep-with:next}')).toBe(true)
  expect(usesKeepWith('<p>ordinary book text</p>', undefined, 'p{margin:0}')).toBe(false)
})

test('typed paragraph keeps enable scripts for continuous books', () => {
  const kept = frameStyleSheets(StyleSheet.parse({ textStyles: { heading: { kind: 'paragraph', keepWithNext: true } } }), undefined)
  expect(continuousBookNeedsScripts('<p class="segnavia-style-heading">Heading</p>', kept, undefined, 'refuse', false)).toBe(true)
  expect(continuousBookNeedsScripts('<p>Ordinary</p>', frameStyleSheets(undefined, undefined), undefined, 'refuse', false)).toBe(false)
})

test('bookPlan turns a style sheet that cannot merge into a render refusal before opening a tab', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    style: { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false
  const planned = renderBrowserBookPlan(
    book,
    {},
    '',
    async () => {
      opened = true
      throw new Error('no tab expected')
    },
    currentDay,
  )
  await expect(planned).rejects.toThrow(RenderRefusedError)
  await expect(planned).rejects.toThrow(/textStyles\.body\.basedOn/)
  expect(opened).toBe(false)
})

test.each([
  { option: 'plan', options: { plan: {} as never } },
  { option: 'breaks', options: { breaks: ['chapter'] as string[] } },
])('bookPdf refuses $option for a continuous book before opening a tab', async ({ options }) => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false

  await expect(
    renderBrowserBookPdf(
      book,
      options,
      '',
      {
        render: async () => {
          opened = true
          throw new Error('no tab expected')
        },
        fontFaces: () => '',
        finish: async (pdf) => pdf,
      },
      currentDay,
    ),
  ).rejects.toThrow('bookPdf with plan or breaks needs a paginated book; set mode to paginated to clear this refusal')
  expect(opened).toBe(false)
})

test('bookPlan reads its published carrier after an authored plan carrier', () => {
  const authored = { textContent: '{"fingerprint":"authored"}' }
  const published = { textContent: '{"fingerprint":"published"}' }
  const root = { querySelectorAll: () => [authored, published] }

  expect(lastBookPlanText(root as unknown as ParentNode)).toBe(published.textContent)
})

test('bookPdf labels a fresh paginated composition from its published plan', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  const published = JSON.stringify({
    version: 5,
    fingerprint: 'fresh',
    breaks: [],
    pages: [planPage(1), planPage(2)],
    folios: [null, '8'],
    total: '8',
    documentFolios: [null, '1'],
    documentTotal: '1',
    recordTotals: {},
    records: {},
  })
  const output = await renderBrowserBookPdf(
    book,
    {},
    '',
    {
      render: async (setup) => {
        await setup.beforeOutput?.({
          waitForFunction: async () => undefined,
          evaluate: async (_function: unknown, argument?: unknown) => (argument === undefined ? published : null),
        } as never)
        const document = await PDFDocument.create()
        const first = document.addPage([419.53, 595.28])
        document.addPage([419.53, 595.28])
        document.catalog.set(PDFName.of('Dests'), document.context.obj({ one: [first.ref, PDFName.of('XYZ'), 0, first.getHeight(), null] }))
        return {
          bytes: await document.save(),
          overflow: { part: 'body', pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
        }
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    currentDay,
  )
  const document = await PDFDocument.load(output)
  const labels = document.catalog.lookup(PDFName.of('PageLabels')) as PDFDict
  const numbers = labels.lookup(PDFName.of('Nums')) as PDFArray
  expect((numbers.lookup(1) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('')
  expect((numbers.lookup(3) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('8')
})

test('bookPdf labels a supplied plan without reading a carrier', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  const plan: Plan = {
    version: 5,
    fingerprint: 'saved',
    breaks: [],
    pages: [planPage(1)],
    folios: ['12'],
    total: '12',
    documentFolios: ['1'],
    documentTotal: '1',
    recordTotals: {},
    records: {},
  }
  let carrierReads = 0
  const output = await renderBrowserBookPdf(
    book,
    { plan },
    '',
    {
      render: async (setup) => {
        await setup.beforeOutput?.({
          waitForFunction: async () => undefined,
          evaluate: async (_function: unknown, argument?: unknown) => {
            if (argument === undefined) carrierReads += 1
            return null
          },
        } as never)
        const document = await PDFDocument.create()
        const first = document.addPage([419.53, 595.28])
        document.catalog.set(PDFName.of('Dests'), document.context.obj({ one: [first.ref, PDFName.of('XYZ'), 0, first.getHeight(), null] }))
        return {
          bytes: await document.save(),
          overflow: { part: 'body', pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
        }
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    currentDay,
  )
  const document = await PDFDocument.load(output)
  const labels = document.catalog.lookup(PDFName.of('PageLabels')) as PDFDict
  const numbers = labels.lookup(PDFName.of('Nums')) as PDFArray
  expect((numbers.lookup(1) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('12')
  expect(carrierReads).toBe(0)
})

test('bookPlan measures the host-filled text that bookPdf prints', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    chapters: [{ title: 'One', html: '<p data-slot-value="school">School</p>' }],
  })
  let html = ''

  await renderBrowserBookPlan(
    book,
    { slots: { fill: { id: 'host', values: { school: 'Lincoln School' } } } },
    '',
    async (setup) => {
      html = setup.html
      throw new Error('no tab expected')
    },
    currentDay,
  ).catch(() => undefined)

  expect(html).toContain('Lincoln School')
})

test('bookPlan measures the as-of text that bookPdf prints', async () => {
  const book = parseBookFixture({
    title: 'Dated workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ title: 'One', html: '<time data-slot-value="asOf.date"></time>' }],
  })
  const day = { date: '2026-11-14', zone: 'UTC', kind: 'fixed' as const }
  let html = ''

  await renderBrowserBookPlan(
    book,
    {},
    '',
    async (setup) => {
      html = setup.html
      throw new Error('no tab expected')
    },
    day,
  ).catch(() => undefined)

  expect(html).toContain('2026-11-14')
})

test('bookPlan refuses a continuous book before opening a tab', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false

  await expect(
    renderBrowserBookPlan(
      book,
      {},
      '',
      async () => {
        opened = true
        throw new Error('no tab expected')
      },
      currentDay,
    ),
  ).rejects.toThrow('bookPlan needs a paginated book; set mode to paginated to clear this refusal')
  expect(opened).toBe(false)
})
