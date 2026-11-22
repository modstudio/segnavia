import { expect, test } from 'bun:test'
import { type Plan, resolveLimits } from '@segnavia/format'
import { parseBookFixture } from '@segnavia/html'
import { PDFDocument, PDFName } from 'pdf-lib'
import { composedPlanFromTab, renderBrowserBookPdf, renderBrowserBookPlan } from './book-render.ts'
import { RenderLimitError } from './errors.ts'

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

function savedPlan(pageCount: number): Plan {
  const pages = Array.from({ length: pageCount }, (_, index) => planPage(index + 1))
  return {
    version: 8,
    fingerprint: 'saved',
    breaks: [],
    pages,
    folios: pages.map((page) => String(page.number)),
    folioPrints: pages.map(() => true),
    total: String(pageCount),
    documentFolios: pages.map((page) => String(page.number)),
    documentTotal: String(pageCount),
    recordTotals: {},
    records: {},
  }
}

function longBook() {
  return parseBookFixture({
    title: 'Long book',
    mode: 'paginated',
    limits: { pages: 1000 },
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
}

function composedTab(plan: Plan) {
  const published = JSON.stringify(plan)
  return {
    waitForFunction: async () => undefined,
    evaluate: async (_function: unknown, argument?: unknown) => (argument === undefined ? published : null),
  } as never
}

function expectHostPageLimit(error: unknown): void {
  expect(error).toBeInstanceOf(RenderLimitError)
  expect(error).toMatchObject({ exceeded: [{ measure: 'pages', actual: 501, limit: 400 }] })
  expect((error as Error).message).toContain("raise the host's limits.pages")
}

test('re-reads a composed plan with the resolved document and host page limit', async () => {
  const published = JSON.stringify(savedPlan(501))
  const tab = { evaluate: async () => published } as never

  await expect(composedPlanFromTab(tab, resolveLimits({ pages: 1000 }, undefined))).resolves.toHaveProperty('pages.length', 501)
  await expect(composedPlanFromTab(tab, resolveLimits({ pages: 1000 }, { pages: 400 }))).rejects.toThrow("raise the host's limits.pages")
})

test('checks a supplied plan once the document page limit is known', async () => {
  const book = longBook()
  const plan = savedPlan(501)
  let renderCalls = 0
  const dependencies = {
    render: async () => {
      renderCalls += 1
      throw new Error('accepted plan reached the print adapter')
    },
    fontFaces: () => '',
    finish: async (pdf: Uint8Array) => pdf,
  }

  await expect(renderBrowserBookPdf(book, { plan }, '', dependencies, currentDay)).rejects.toThrow('accepted plan reached the print adapter')
  expect(renderCalls).toBe(1)
  try {
    await renderBrowserBookPdf(book, { plan, limits: { pages: 400 } }, '', dependencies, currentDay)
    throw new Error('expected the supplied plan to exceed the host page limit')
  } catch (error) {
    expectHostPageLimit(error)
  }
  expect(renderCalls).toBe(1)
})

test('bookPdf checks a composed plan against the filled book page limit', async () => {
  const book = longBook()
  const plan = savedPlan(501)
  const dependencies = {
    render: async (setup: Parameters<Parameters<typeof renderBrowserBookPdf>[3]['render']>[0]) => {
      await setup.beforeOutput?.(composedTab(plan))
      const document = await PDFDocument.create()
      const first = document.addPage([419.53, 595.28])
      for (let page = 1; page < plan.pages.length; page += 1) document.addPage([419.53, 595.28])
      document.catalog.set(PDFName.of('Dests'), document.context.obj({ one: [first.ref, PDFName.of('XYZ'), 0, first.getHeight(), null] }))
      return {
        bytes: await document.save(),
        overflow: { part: 'body' as const, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
      }
    },
    fontFaces: () => '',
    finish: async (pdf: Uint8Array) => pdf,
  }

  await expect(renderBrowserBookPdf(book, {}, '', dependencies, currentDay)).resolves.toBeInstanceOf(Uint8Array)
  try {
    await renderBrowserBookPdf(book, { limits: { pages: 400 } }, '', dependencies, currentDay)
    throw new Error('expected the composed plan to exceed the host page limit')
  } catch (error) {
    expectHostPageLimit(error)
  }
})

test('bookPlan checks a composed plan against the filled book page limit', async () => {
  const book = longBook()
  const plan = savedPlan(501)
  const withTab = async (_setup: unknown, body: (tab: never) => Promise<Plan>) => body(composedTab(plan))

  await expect(renderBrowserBookPlan(book, {}, '', withTab, currentDay)).resolves.toEqual(plan)
  try {
    await renderBrowserBookPlan(book, { limits: { pages: 400 } }, '', withTab, currentDay)
    throw new Error('expected the composed plan to exceed the host page limit')
  } catch (error) {
    expectHostPageLimit(error)
  }
})
