import { expect, mock, test } from 'bun:test'

let slotFit: { type: string; slots: Record<string, string> } = { type: 'segnavia:slot-fit', slots: { name: 'fit' } }

const frame = {
  locator: () => ({ waitFor: async () => {} }),
}

const tab = {
  setContent: async () => {},
  evaluate(callback: (...args: never[]) => unknown) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    if (String(callback).includes('__segnaviaSlotFit')) return Promise.resolve([slotFit])
    return Promise.resolve(undefined)
  },
  waitForFunction: async () => {},
  screenshot: async () => new Uint8Array([1, 2, 3]),
  locator: () => ({ contentFrame: () => frame }),
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
