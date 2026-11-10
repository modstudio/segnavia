import { expect, mock, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'

const documents: string[] = []
const tab = {
  setContent(html: string) {
    documents.push(html)
    return Promise.resolve()
  },
  evaluate(callback: (...args: never[]) => unknown) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    return Promise.resolve({ extent: 200, endOverflow: 0, extentClipped: false, rtl: false, elements: [] })
  },
  emulateMedia() {
    return Promise.resolve()
  },
  async pdf() {
    const document = await PDFDocument.create({ updateMetadata: false })
    document.addPage()
    document.setTitle('about:blank')
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
const context = {
  route() {
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
const browser = {
  newContext: () => Promise.resolve(context),
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

test('renders without a composer refuse progress while printed composition remains eligible', async () => {
  documents.length = 0
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const progress = { report: () => {} }
  const page: import('@segnavia/format').DocumentInput = {
    type: 'document',
    kind: 'page',
    size: { width: 200, height: 100 },
    children: [{ type: 'page', body: { html: '<p>Plain page</p>' } }],
  }
  const refusal = 'The progress option is reported by a paginated book or a printed page; this render runs no composer. Omit progress to clear this refusal.'
  const deck: import('@segnavia/format').DocumentInput = {
    type: 'document',
    kind: 'deck',
    title: 'Deck',
    size: { width: 200, height: 100 },
    children: [{ type: 'slide', content: { kind: 'html', html: '<p>Slide</p>' } }],
  }
  const calls = [
    () => renderer.pagePdf(page, { progress }),
    () => renderer.pageImage(page, { progress }),
    () => renderer.coverImage({ page }, { width: 160, progress }),
    () =>
      renderer.bookPdf(
        {
          type: 'document',
          kind: 'book',
          title: 'Continuous',
          mode: 'continuous',
          page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
          children: [
            {
              type: 'division',
              name: 'body',
              children: [{ type: 'section', title: 'One', children: [{ type: 'flow', html: '<p>Text</p>' }] }],
            },
          ],
        },
        { progress },
      ),
    () => renderer.deckPdf(deck, { progress }),
    () => renderer.slideImage(deck, 0, { progress }),
  ]
  for (const call of calls) await expect(call()).rejects.toThrow(refusal)
  expect(documents).toHaveLength(0)
  await renderer.close()
})

test('pagesPdf refuses progress once for its several printed compositions', async () => {
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
  await expect(renderer.pagesPdf([printed, printed], { progress: { report: () => {} } })).rejects.toThrow(
    'The progress option is reported per single composition; this render runs 2 compositions. Omit progress and render one paginated book or printed page at a time',
  )
  expect(documents).toHaveLength(0)
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
  expect(reports).toContainEqual({ failures: [{ font: 'missing', family: 'missing', reason: 'unsupplied' }] })
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
