import { expect, mock, test } from 'bun:test'

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
  pdf() {
    return Promise.resolve(new Uint8Array([1, 2, 3]))
  },
  screenshot() {
    return Promise.resolve(new Uint8Array([4, 5, 6]))
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
  const page = { html: '<main data-motif="letterhead">Authored</main>', lang: 'en', size: { width: 200, height: 100 } } as const
  await renderer.pagePdf(page, { motifs, effects: false })
  await renderer.pageImage(page, { motifs, effects: false })
  await renderer.close()

  expect(documents).toHaveLength(2)
  for (const html of documents) {
    expect(html).toContain('<main data-motif="letterhead" lang="en" dir="ltr"><header>Expanded once</header></main>')
    expect(html).not.toContain('Authored')
  }
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
        html: '<p style="font-family:Local Family">Local</p>',
        fonts: [
          { local: 'Local Family', fallback: 'serif' },
          { local: 'Missing Family', fallback: 'heading' },
        ],
        size: { width: 200, height: 100 },
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
  for (let attempt = 0; attempt < 20 && decoded.some((reference) => reference.deref()); attempt += 1) {
    Bun.gc(true)
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  expect(decoded.every((reference) => reference.deref() === undefined)).toBe(true)
})
