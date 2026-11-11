import { expect, mock, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'

let slotFit: { type: string; slots: Record<string, string> } = { type: 'segnavia:slot-fit', slots: { name: 'fit' } }
let screenshotBytes = new Uint8Array([1, 2, 3])
let renderedHtml: string[] = []

const frame = {
  locator: () => ({ waitFor: async () => {} }),
}

const tab = {
  setContent: async (html: string) => void renderedHtml.push(html),
  evaluate(callback: (...args: never[]) => unknown) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    if (String(callback).includes('__segnaviaSlotFit')) return Promise.resolve([slotFit])
    return Promise.resolve(undefined)
  },
  waitForFunction: async () => {},
  screenshot: async () => screenshotBytes,
  pdf: async () => {
    const document = await PDFDocument.create()
    document.addPage([400, 200]).drawRectangle({ x: 0, y: 0, width: 400, height: 200 })
    return document.save()
  },
  locator: () => ({ contentFrame: () => frame, evaluateAll: async () => [], waitFor: async () => {} }),
  on() {
    return tab
  },
}

const context = {
  addInitScript: async () => {},
  route: async () => {},
  routeWebSocket: async () => {},
  newPage: async () => tab,
  close: async () => {},
}

const browser = {
  newContext: async () => context,
  close: async () => {},
  isConnected: () => true,
  on() {
    return browser
  },
  off() {
    return browser
  },
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

test("slideImage measures only the selected slide's refuse-overflow slots", async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const deck = {
      type: 'document' as const,
      kind: 'deck' as const,
      title: 'Repeated slot',
      size: { width: 400, height: 200 },
      data: { slots: [{ key: 'name', label: 'Name', type: 'text' as const, overflow: 'refuse' as const }] },
      children: [
        { type: 'slide' as const, id: 'one', content: { kind: 'html' as const, html: '<p data-slot-value="name">Name</p>' } },
        { type: 'slide' as const, id: 'two', content: { kind: 'html' as const, html: '<p data-slot-value="name">Name</p>' } },
      ],
    }

    await expect(renderer.slideImage(deck, 0, { slots: { fill: { id: 'host', values: { name: 'Ada' } } } })).resolves.toEqual(new Uint8Array([1, 2, 3]))
  } finally {
    await renderer.close()
  }
})

test('slideImage reports, resolves slots for and stamps a fixed deck day', async () => {
  renderedHtml = []
  const { pngChunk } = await import('./png-chunk.ts')
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = pngChunk('IHDR', new Uint8Array(13))
  const iend = pngChunk('IEND', new Uint8Array())
  screenshotBytes = new Uint8Array(signature.length + ihdr.length + iend.length)
  screenshotBytes.set(signature)
  screenshotBytes.set(ihdr, signature.length)
  screenshotBytes.set(iend, signature.length + ihdr.length)
  let reportedDate: string | undefined
  let slotDate: string | undefined
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const output = await renderer.slideImage(
      {
        type: 'document',
        kind: 'deck',
        title: 'Dated slide',
        size: { width: 400, height: 200 },
        asOf: { kind: 'fixed', date: '2026-11-14' },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<time data-slot-value="asOf.date"></time>' } }],
      },
      0,
      {
        asOf: { report: (days) => (reportedDate = days[0]?.date) },
        slots: {
          resolve: async ({ day }) => {
            slotDate = day.date
            return undefined
          },
        },
      },
    )
    expect(new TextDecoder().decode(output)).toContain('Creation Time\u00002026-11-14')
    expect({ reportedDate, slotDate }).toEqual({ reportedDate: '2026-11-14', slotDate: '2026-11-14' })
    expect(renderedHtml.some((html) => html.includes('2026-11-14'))).toBe(true)
  } finally {
    screenshotBytes = new Uint8Array([1, 2, 3])
    await renderer.close()
  }
})

test('deckPdf passes its bound fixed day to rendered slide HTML', async () => {
  renderedHtml = []
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    await renderer.deckPdf(
      {
        type: 'document',
        kind: 'deck',
        title: 'Dated deck',
        size: { width: 400, height: 200 },
        asOf: { kind: 'fixed', date: '2026-11-14' },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<time data-slot-value="asOf.date"></time>' } }],
      },
      { effects: false },
    )
    expect(renderedHtml.some((html) => html.includes('2026-11-14'))).toBe(true)
  } finally {
    await renderer.close()
  }
})

test('slideImage without as-of inputs leaves PNG bytes undated and unchanged', async () => {
  const { pngChunk } = await import('./png-chunk.ts')
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = pngChunk('IHDR', new Uint8Array(13))
  const iend = pngChunk('IEND', new Uint8Array())
  screenshotBytes = new Uint8Array(signature.length + ihdr.length + iend.length)
  screenshotBytes.set(signature)
  screenshotBytes.set(ihdr, signature.length)
  screenshotBytes.set(iend, signature.length + ihdr.length)
  const expected = screenshotBytes.slice()
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const output = await renderer.slideImage(
      {
        type: 'document',
        kind: 'deck',
        title: 'Undated slide',
        size: { width: 400, height: 200 },
        children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: '<p>Plain</p>' } }],
      },
      0,
    )
    expect(output).toEqual(expected)
    expect(new TextDecoder().decode(output)).not.toContain('Creation Time')
  } finally {
    screenshotBytes = new Uint8Array([1, 2, 3])
    await renderer.close()
  }
})

test.each([
  ['default', 'warnings'],
  ['strict', 'refuses'],
] as const)('slideImage %s preflight reports an overset slide and %s', async (profile, outcome) => {
  slotFit = { type: 'segnavia:slot-fit', slots: { name: 'overflowed' } }
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const reports: Array<{ status: string; issues: readonly { location?: { folio?: string } }[] }> = []
  try {
    const deck = {
      type: 'document' as const,
      kind: 'deck' as const,
      title: 'Overset slot',
      size: { width: 400, height: 200 },
      data: { slots: [{ key: 'name', label: 'Name', type: 'text' as const, overflow: 'shrink' as const }] },
      children: [{ type: 'slide' as const, id: 'one', content: { kind: 'html' as const, html: '<p data-slot-value="name">Name</p>' } }],
    }
    const rendering = renderer.slideImage(deck, 0, {
      slots: { fill: { id: 'host', values: { name: 'A very long name' } } },
      preflight: { profile, report: (report) => reports.push(report) },
    })
    if (outcome === 'refuses') await expect(rendering).rejects.toThrow('Slot name is overset')
    else await expect(rendering).resolves.toEqual(new Uint8Array([1, 2, 3]))
    expect(reports).toHaveLength(1)
    expect(reports[0]?.status).toBe(profile === 'strict' ? 'errors' : 'warnings')
    expect(reports[0]?.issues[0]?.location).toEqual({ folio: '1' })
  } finally {
    slotFit = { type: 'segnavia:slot-fit', slots: { name: 'fit' } }
    await renderer.close()
  }
})
