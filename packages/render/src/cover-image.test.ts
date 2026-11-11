import { expect, mock, test } from 'bun:test'
import { Cover, type coverDigest, Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { coverImagePlan } from './cover-image.ts'
import { renderPreparedPageImage } from './page-image-render.ts'
import { completePreflight, resolveRenderPreflight } from './preflight.ts'
import type { Renderer } from './renderer.ts'

const coverDocument = (html: string, print?: { paper: { width: number; height: number; unit: 'mm' } }) => ({
  type: 'document' as const,
  kind: 'page' as const,
  print,
  children: [{ type: 'page' as const, body: { html } }],
})
const cover = Cover.parse({ page: coverDocument('<h1>Cover</h1>') })

type Same<Left, Right> = (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
const sharedCoverInput: Same<Parameters<Renderer['coverImage']>[0], Parameters<typeof coverDigest>[0]> = true
void sharedCoverInput

let slotFit = { type: 'segnavia:slot-fit', slots: { title: 'fit' } }
let composedPreflight: string | null = null
const tab = {
  setContent: async () => {},
  evaluate(callback: (...args: never[]) => unknown, argument?: string) {
    if (String(callback).includes('document.fonts')) return Promise.resolve(true)
    if (String(callback).includes('__segnaviaSlotFit')) return Promise.resolve([slotFit])
    if (argument === 'data-segnavia-preflight') return Promise.resolve(composedPreflight)
    return Promise.resolve(null)
  },
  waitForFunction: async () => {},
  screenshot: async () => new Uint8Array([1, 2, 3]),
  on: () => tab,
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
  isConnected: () => true,
  on: () => browser,
  off: () => browser,
  close: async () => {},
}

mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

test('renderer coverImage refuses an invalid input through the returned promise', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const rendered = renderer.coverImage({ page: { type: 'document', kind: 'printed', children: [] } }, { width: 160 })
  expect(rendered).toBeInstanceOf(Promise)
  await expect(rendered).rejects.toThrow('page')
  await renderer.close()
})

test.each([
  [160, 100],
  [320, 200],
  [800, 500],
  [1601, 1000],
])('derives an exact %i × %i cover image', (width, height) => {
  const plan = coverImagePlan(cover, { width })
  expect(plan.height).toBe(height)
  expect(plan.options.scale).toBe(width / 605)
})

test('cover image rendering keeps composer preflight for a printed cover without also reporting surface preflight', async () => {
  slotFit = { type: 'segnavia:slot-fit', slots: { title: 'overflowed' } }
  composedPreflight = JSON.stringify({
    issues: [
      {
        check: 'css-var-invalid',
        subject: '--missing',
        message: 'Custom property --missing is invalid; define it or add a var() fallback to clear it.',
      },
    ],
    facts: { pageCount: 1, pages: [{ folio: '1' }], fits: [] },
  })
  const reports: Array<{ issues: readonly { check: string }[] }> = []
  try {
    const preflight = resolveRenderPreflight({ profile: 'default', report: (report) => reports.push(report) })
    const page = resolvePageHtml(
      Page.parse({
        html: '<p style="color:var(--missing)">Cover</p>',
        print: { paper: { width: 160, height: 100, unit: 'mm' } },
        printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
      }),
    )
    await renderPreparedPageImage(
      {
        page,
        options: { format: 'png', preflight },
        fontCss: '',
        fontFailures: [],
        established: { day: undefined, slots: undefined },
      } as never,
      { format: 'png' },
      { signal: AbortSignal.any([]), remaining: () => 1_000 },
      async (setup, body) => {
        setup.preflightReport?.({ fontFailures: [], slotFits: [{ title: 'overflowed' }] })
        return body(tab as never)
      },
      completePreflight(preflight, 1),
    )
    expect(reports).toHaveLength(1)
    expect(reports[0]?.issues.map((issue) => issue.check)).toEqual(['css-var-invalid'])
  } finally {
    slotFit = { type: 'segnavia:slot-fit', slots: { title: 'fit' } }
    composedPreflight = null
  }
})

test('defaults to WebP and forwards asset policy options', () => {
  const assets = async () => ({ body: new Uint8Array(), contentType: 'text/plain' })
  const origins = [{ origin: 'https://example.com', kinds: ['image'] as const }]
  const plan = coverImagePlan(cover, {
    width: 320,
    assets,
    origins,
  })
  expect(plan.options.format).toBe('webp')
  expect(plan.options.assets).toBe(assets)
  expect(plan.options.origins).toBe(origins)
})

test('uses a non-default cover sheet aspect', () => {
  const portrait = Cover.parse({ page: coverDocument('', { paper: { width: 100, height: 150, unit: 'mm' } }) })
  expect(coverImagePlan(portrait, { width: 200 }).height).toBe(300)
})

test('keeps PNG and refuses a non-positive or fractional width', () => {
  expect(coverImagePlan(cover, { width: 160, format: 'png' }).options.format).toBe('png')
  expect(() => coverImagePlan(cover, { width: 0 })).toThrow('positive integer pixel width')
  expect(() => coverImagePlan(cover, { width: 10.5 })).toThrow('positive integer pixel width')
})

test('refuses a missing options object by naming the width', () => {
  expect(() => coverImagePlan(cover, undefined)).toThrow('Cover image width is undefined; use a positive integer pixel width')
  expect(() => coverImagePlan(cover, null)).toThrow('Cover image width is undefined; use a positive integer pixel width')
})

test.each([
  ['default', 'warnings'],
  ['strict', 'refuses'],
] as const)('coverImage %s preflight reports an overset slot and %s', async (profile, outcome) => {
  slotFit = { type: 'segnavia:slot-fit', slots: { title: 'overflowed' } }
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  const reports: Array<{ status: string; issues: readonly { location?: unknown }[] }> = []
  try {
    const input = {
      page: {
        type: 'document' as const,
        kind: 'page' as const,
        data: { slots: [{ key: 'title', label: 'Title', type: 'text' as const, overflow: 'truncate' as const }] },
        children: [{ type: 'page' as const, body: { html: '<h1 data-slot-value="title">Title</h1>' } }],
      },
    }
    const rendering = renderer.coverImage(input, {
      width: 160,
      format: 'png',
      slots: { fill: { id: 'host', values: { title: 'A very long title' } } },
      preflight: { profile, report: (report) => reports.push(report) },
    })
    if (outcome === 'refuses') await expect(rendering).rejects.toThrow('Slot title is overset')
    else expect(await rendering).toEqual(new Uint8Array([1, 2, 3]))
    expect(reports).toHaveLength(1)
    expect(reports[0]?.status).toBe(profile === 'strict' ? 'errors' : 'warnings')
    expect(reports[0]?.issues[0]?.location).toBeUndefined()
  } finally {
    slotFit = { type: 'segnavia:slot-fit', slots: { title: 'fit' } }
    await renderer.close()
  }
})
