import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { prepareShownPage } from './page-preparation.ts'
import { SlotFillRefusedError } from './slot-render.ts'

test('a scripted slot fill refuses before an unresolved declared font', async () => {
  const page: HtmlPage = {
    html: '<p data-slot-value="name">Authored</p>',
    size: { width: 'full', height: 'auto' },
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text', required: false, overflow: 'wrap' }],
    style: { fonts: { missing: { faces: [{}] } } },
  }
  const signal = new AbortController().signal
  await expect(prepareShownPage(page, undefined, { fill: { id: 'held', values: { name: 'Filled' } } }, undefined, signal)).rejects.toBeInstanceOf(
    SlotFillRefusedError,
  )
})

test('a page binding its day with placements injects the reserved slots once', async () => {
  const page: HtmlPage = {
    html: '<time data-slot-value="asOf.date">placeholder</time>',
    size: { width: 'full', height: 'auto' },
    scripts: 'refuse',
    slots: [],
    style: { fonts: {} },
  }
  const day = { date: '2026-11-14', zone: 'UTC', kind: 'current' as const }
  const prepared = await prepareShownPage(
    page,
    undefined,
    undefined,
    undefined,
    new AbortController().signal,
    { resolve: async () => undefined },
    undefined,
    day,
  )
  expect(prepared.resolved?.apply(prepared.page.html)).toContain('2026-11-14')
})

test('a scripted motif page refuses the effective slots that include its day', async () => {
  const page: HtmlPage = {
    html: '<time data-slot-value="asOf.date"></time><div data-motif="dated"></div>',
    size: { width: 'full', height: 'auto' },
    scripts: 'sandboxed',
    slots: [],
    style: { fonts: {} },
  }
  const motifs = {
    source: {
      motif: async () => ({ key: 'dated', revision: '1', label: 'Dated', fields: [], fonts: [], versions: [{ lang: 'en', html: '<p>Dated</p>' }] }),
    },
  }
  await expect(
    prepareShownPage(page, motifs, undefined, undefined, new AbortController().signal, undefined, undefined, {
      date: '2026-11-14',
      zone: 'UTC',
      kind: 'current',
    }),
  ).rejects.toBeInstanceOf(SlotFillRefusedError)
})
