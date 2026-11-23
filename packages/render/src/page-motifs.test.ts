import { expect, mock, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import type { RenderProgress } from './progress.ts'
import { RENDER_PLACEHOLDER_TITLE } from './render-document-origin.ts'

const documents: string[] = []
type RouteHandler = (route: {
  request(): unknown
  fulfill(options: { body: string }): Promise<void>
  abort(): Promise<void>
  continue(): Promise<void>
}) => Promise<void>

function fakeTab(routeHandler: () => RouteHandler | undefined) {
  const exposed = new Map<string, (value: unknown) => void>()
  const tab = {
    async goto(url: string) {
      const mainFrame = { page: () => ({ mainFrame: () => mainFrame }) }
      await routeHandler()?.({
        request: () => ({ url: () => url, resourceType: () => 'document', isNavigationRequest: () => true, frame: () => mainFrame }),
        fulfill: async ({ body }) => {
          documents.push(body)
        },
        abort: async () => {},
        continue: async () => {},
      })
      for (const report of exposed.values()) report({ pages: 1, total: 1 })
    },
    exposeFunction(name: string, report: (value: unknown) => void) {
      exposed.set(name, report)
      return Promise.resolve()
    },
    waitForFunction() {
      return Promise.resolve()
    },
    evaluate(callback: (...args: never[]) => unknown) {
      if (String(callback).includes('document.fonts')) return Promise.resolve(true)
      if (String(callback).includes('getAttribute')) return Promise.resolve(null)
      return Promise.resolve({ extent: 200, endOverflow: 0, extentClipped: false, rtl: false, elements: [] })
    },
    emulateMedia() {
      return Promise.resolve()
    },
    viewportSize() {
      return { width: 200, height: 100 }
    },
    setViewportSize() {
      return Promise.resolve()
    },
    async pdf() {
      const document = await PDFDocument.create({ updateMetadata: false })
      document.addPage([612, 792])
      document.setTitle(RENDER_PLACEHOLDER_TITLE)
      return document.save()
    },
    screenshot() {
      return Promise.resolve(new Uint8Array([4, 5, 6]))
    },
    locator() {
      return { evaluateAll: () => Promise.resolve([]), contentFrame: () => tab }
    },
    on() {
      return tab
    },
  }
  return tab
}

function fakeContext() {
  let routeHandler: RouteHandler | undefined
  const tab = fakeTab(() => routeHandler)
  return {
    route(_pattern: string, handler: RouteHandler) {
      routeHandler = handler
      return Promise.resolve()
    },
    routeWebSocket() {
      return Promise.resolve()
    },
    newPage: () => Promise.resolve(tab),
    close() {
      return Promise.resolve()
    },
  }
}
const browser = {
  newContext: () => Promise.resolve(fakeContext()),
  close() {
    return Promise.resolve()
  },
  isConnected: () => true,
  on() {
    return browser
  },
  off() {
    return browser
  },
}

mock.module('playwright-core', () => ({ chromium: { launch: () => Promise.resolve(browser) } }))

test('pagePdf and pageImage print the same motif-expanded page', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const motifs = {
    source: {
      motif: async () => ({
        key: 'letterhead',
        revision: '1',
        label: 'Letterhead',
        fields: [],
        versions: [{ lang: 'en', html: '<header>Expanded once</header>' }],
        fonts: [],
      }),
    },
  }
  const page: import('@segnavia/format').DocumentInput = {
    type: 'document',
    kind: 'page',
    settings: { lang: 'en' },
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<main data-motif="letterhead">Authored</main>' } }],
  }
  const pdf = await renderer.pagePdf(page, { motifs, effects: false })
  await renderer.pageImage(page, { motifs, effects: false })
  await renderer.close()

  expect(documents).toHaveLength(2)
  expect((await PDFDocument.load(pdf, { updateMetadata: false })).getTitle()).toBeUndefined()
  for (const html of documents) {
    expect(html).toContain('<main data-motif="letterhead" lang="en" dir="ltr"><header>Expanded once</header></main>')
    expect(html).not.toContain('Authored')
  }
})

test('a render without a composer reports set and finish progress', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const reports: RenderProgress[] = []
  const progress = { report: (report: (typeof reports)[number]) => reports.push(report) }
  const page: import('@segnavia/format').DocumentInput = {
    type: 'document',
    kind: 'page',
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<p>Plain page</p>' } }],
  }
  await renderer.pagePdf(page, { progress, effects: false })
  expect(reports).toEqual([
    { stage: 'set', stages: ['set', 'finish'], done: 1, total: 1 },
    { stage: 'finish', stages: ['set', 'finish'], done: 1, total: 1 },
  ])
  await renderer.close()
})

test('pagesPdf reports its several printed compositions per input', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const printed: import('@segnavia/format').DocumentInput = {
    type: 'document',
    kind: 'printed',
    print: { paper: 'letter' },
    parentPages: [
      {
        type: 'parentPage',
        name: 'body',
        geometry: { margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      },
    ],
    parentRules: [{ parent: 'body' }],
    children: [{ type: 'page', body: { html: '<p>Printed page</p>' } }],
  }
  const reports: RenderProgress[] = []
  await renderer.pagesPdf([printed, printed], { effects: false, progress: { report: (report) => reports.push(report) } })
  expect(reports.filter(({ stage }) => stage === 'compose')).toEqual([
    { stage: 'compose', stages: ['compose', 'set', 'finish'], done: 1, total: 1, input: 0 },
    { stage: 'compose', stages: ['compose', 'set', 'finish'], done: 1, total: 1, input: 1 },
  ])
  expect(
    reports
      .filter(({ stage }) => stage === 'set')
      .map(({ input }) => input)
      .sort(),
  ).toEqual([0, 1])
  await renderer.close()
})

test('pagesPdf refuses a named brand without a source before opening a tab', async () => {
  documents.length = 0
  const { openRenderer, RenderRefusedError } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const rendering = renderer.pagesPdf([
    {
      type: 'document',
      kind: 'page',
      brand: 'house',
      size: { width: 200, height: 100 },
      children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
    },
  ])
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  expect(documents).toHaveLength(0)
  await renderer.close()
})

test('pagesPdf settles invalid documents and preserves their original indices', async () => {
  documents.length = 0
  const { openRenderer, RenderInputsRefusedError } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const good = {
    type: 'document',
    kind: 'page',
    id: 'good',
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
  }
  try {
    await renderer.pagesPdf([{ ...good, id: 'bad-one', kind: 'unknown' } as never, good as never, { ...good, id: 'bad-three', kind: 'unknown' } as never])
    throw new Error('expected refused inputs')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderInputsRefusedError)
    expect((error as InstanceType<typeof RenderInputsRefusedError>).entries.map(({ index, id }) => ({ index, id }))).toEqual([
      { index: 0, id: 'bad-one' },
      { index: 2, id: 'bad-three' },
    ])
    expect((error as Error).message).toContain('could not be read as a document at kind')
    expect((error as Error).message).toContain('correct the document, or remove it from the request')
  } finally {
    await renderer.close()
  }
  expect(documents).toHaveLength(1)
})

test('pagesPdf skips a parse-refused input through the public renderer and reports it once', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const good = {
    type: 'document',
    kind: 'page',
    id: 'good',
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
  }
  const refusals: unknown[] = []
  const progress: RenderProgress[] = []
  const pdf = await renderer.pagesPdf([{ ...good, id: 'bad-one', kind: 'unknown' } as never, good as never], {
    skipRefused: { report: (entries) => refusals.push(entries) },
    effects: false,
    progress: { report: (report) => progress.push(report) },
  })
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1)
  expect(refusals).toMatchObject([[{ index: 0, id: 'bad-one', error: { code: 'render' } }]])
  expect(progress.filter(({ input }) => input === 0)).toEqual([])
  expect(progress).toContainEqual({ stage: 'set', stages: ['set', 'finish'], done: 1, total: 1, input: 1 })
  expect(progress).toContainEqual({ stage: 'finish', stages: ['set', 'finish'], done: 1, total: 1 })
  expect(documents).toHaveLength(1)
  await renderer.close()
})

test('pagesPdf keeps dates for two inputs with the same as-of day', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const page = {
    type: 'document',
    kind: 'page',
    asOf: { kind: 'fixed', date: '2026-11-14', zone: 'UTC' },
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
  }
  const pdf = await renderer.pagesPdf([page as never, page as never])
  const loaded = await PDFDocument.load(pdf, { updateMetadata: false })
  expect(loaded.getCreationDate()).toBeDefined()
  expect(loaded.getModificationDate()).toBeDefined()
  await renderer.close()
})

test('pagesPdf treats one page slot-fill refusal as an input refusal', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const page = {
    type: 'document',
    kind: 'page',
    size: { width: 200, height: 100 },
    data: { slots: [{ key: 'name', label: 'Name', type: 'text' }] },
    children: [{ type: 'page', body: { html: '<p data-slot-value="name">Body</p>' } }],
  }
  const reports: unknown[] = []
  const pdf = await renderer.pagesPdf(
    [{ ...page, id: 'bad', settings: { scripts: 'sandboxed' } } as never, { ...page, id: 'good', settings: { scripts: 'refuse' } } as never],
    {
      slots: { fill: { id: 'host', values: { name: 'Ada' } } },
      skipRefused: { report: (entries) => reports.push(entries) },
    },
  )
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1)
  expect(reports).toMatchObject([[{ index: 0, id: 'bad' }]])
  await renderer.close()
})

test('deckPdf reports an unsupplied declared face', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const reports: unknown[] = []
  try {
    await renderer.deckPdf(
      {
        type: 'document',
        kind: 'deck',
        title: 'Font report',
        style: { fonts: { missing: { faces: [{}] } } },
        size: { width: 200, height: 100 },
        children: [{ type: 'slide', content: { kind: 'image', src: 'data:image/png;base64,', alt: '' } }],
      },
      { fontSource: { font: async () => undefined }, fontLoad: { report: (report) => reports.push(report) } },
    )
  } finally {
    await renderer.close()
  }
  expect(reports).toContainEqual({ failures: [{ font: 'missing', family: 'missing', weight: 400, reason: 'unsupplied' }] })
})

test('pagePdf embeds only named transported local faces and retains no decoded buffer', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const reports: unknown[] = []
  const decoded: Array<WeakRef<Uint8Array>> = []
  const NativeUint8Array = Uint8Array
  const host = globalThis as { Uint8Array: typeof Uint8Array }
  host.Uint8Array = new Proxy(NativeUint8Array, {
    construct(target, args) {
      const value = Reflect.construct(target, args) as Uint8Array
      if (args[0] === 5) decoded.push(new WeakRef(value))
      return value
    },
  })
  try {
    await renderer.pagePdf(
      {
        type: 'document',
        kind: 'page',
        style: {
          fonts: {
            local: { local: 'Local Family', fallback: 'serif' },
            missing: { local: 'Missing Family', fallback: 'heading' },
          },
        },
        size: { width: 200, height: 100 },
        children: [{ type: 'page', body: { html: '<p style="font-family:Local Family">Local</p>' } }],
      },
      {
        effects: false,
        fontSource: {
          font: async (name) =>
            ({
              serif: { family: 'Body Serif', faces: [], generic: 'serif' as const },
              heading: { family: 'Heading Sans', faces: [], generic: 'sans-serif' as const },
            })[name],
        },
        localFonts: {
          faces: [
            { family: 'local family', format: 'truetype', data: 'AAEAAAc=' },
            { family: 'Unreferenced Family', format: 'truetype', data: 'AAEAAAc=' },
          ],
          report: (report) => reports.push(report),
        },
      },
    )
  } finally {
    host.Uint8Array = NativeUint8Array
    await renderer.close()
  }

  expect(documents[0]).toContain('@font-face{font-family:"Local Family"')
  expect(documents[0]).not.toContain('Unreferenced Family')
  expect(reports).toEqual([{ fellBack: [{ family: 'Missing Family', fallback: 'heading' }] }])
  expect(decoded).toHaveLength(2)
  for (let attempt = 0; attempt < 50 && decoded.some((reference) => reference.deref()); attempt += 1) {
    Bun.gc(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
  expect(decoded.every((reference) => reference.deref() === undefined)).toBe(true)
})
