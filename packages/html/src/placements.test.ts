import { describe, expect, test } from 'bun:test'
import type { Media } from '@segnavia/format'
import { placementPlan, type ResolvePlacement, resolvePlacements } from './placements.ts'

const signal = new AbortController().signal
const media = (alt?: Media['alt']): Media => ({ format: 'png', size: { width: 20, height: 10 }, ...(alt ? { alt } : {}) })
const png = 'data:image/png;base64,AA=='
const svg = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'

describe('placementPlan', () => {
  test('parses address, page selectors, box, crop, and author attributes', () => {
    const html =
      '<img data-segnavia-media="a" data-segnavia-page="Cover" data-segnavia-box="trim" data-segnavia-crop="10% 0 10% 0" alt="A" lang="en" dir="ltr" width="200"><img data-segnavia-media="b" data-segnavia-page="2"><img data-segnavia-media="c" data-segnavia-page="007">'
    const plan = placementPlan(html)
    expect(plan.refusals).toEqual([])
    expect(plan.entries.map(({ placement }) => placement)).toEqual([
      { kind: 'media', address: 'a', page: 'Cover', box: 'trim', crop: { top: '10%', right: '0', bottom: '10%', left: '0' } },
      { kind: 'media', address: 'b', page: 2 },
      { kind: 'media', address: 'c', page: '007' },
    ])
    expect(plan.entries[0]).toMatchObject({ index: 0, alt: 'A', lang: 'en', dir: 'ltr', width: 200 })
  })

  test('turns parse refusals into refusal entries', () => {
    expect(placementPlan('<p></p><img data-segnavia-media="">').refusals[0]).toMatchObject({ index: 1, address: '' })
  })
})

describe('resolvePlacements', () => {
  test('keeps documents without placements byte-identical', async () => {
    const html = "<IMG src='data:image/png,x'>\n<p>held</p>"
    expect(await resolvePlacements(html, { resolvePlacement: async () => undefined, purpose: 'screen', width: 100, signal })).toBe(html)
  })

  test.each([png, svg])('sets accepted data image source %s', async (src) => {
    const output = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({ kind: 'media', media: media(), src }),
      purpose: 'screen',
      width: 100,
      signal,
    })
    expect(output).toContain(`src="${src.replaceAll('&', '&amp;')}"`)
    expect(output).not.toContain('data-segnavia-media')
  })

  test.each(['https://example.com/x.png', 'blob:x', 'data:text/html,x', 'data:image/svg+xmlx,x'])('refuses unsafe source %s', async (src) => {
    const reports: unknown[] = []
    const output = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({ kind: 'media', media: media(), src }),
      purpose: 'screen',
      width: 100,
      signal,
      report: (entry) => reports.push(entry),
    })
    expect(output).toContain('data-segnavia-placement="missing"')
    expect(reports).toEqual([{ address: 'a', page: undefined, reason: 'refused-src' }])
  })

  test('fills absent alt and direction but keeps authored empty alt', async () => {
    const resolver: ResolvePlacement = async () => ({ kind: 'media', media: media({ text: 'שלום', lang: 'he' }), src: png })
    const output = await resolvePlacements('<img data-segnavia-media="a"><img data-segnavia-media="b" alt="">', {
      resolvePlacement: resolver,
      purpose: 'screen',
      width: 100,
      signal,
    })
    expect(output).toContain('alt="שלום" lang="he" dir="rtl"')
    expect(output).toMatch(/<img alt(?:="")? src=/)
  })

  test('appends crop to authored style and passes purpose and widths', async () => {
    const contexts: unknown[] = []
    const output = await resolvePlacements(
      '<img data-segnavia-media="a" width="40" style="object-fit:cover" data-segnavia-crop="1px 2px 3px 4px"><img data-segnavia-media="b">',
      {
        resolvePlacement: async (_placement, context) => {
          contexts.push({ purpose: context.purpose, width: context.width })
          return { kind: 'media', media: media(), src: png }
        },
        purpose: 'print',
        width: 600,
        signal,
      },
    )
    expect(output).toContain('object-fit:cover; object-view-box: inset(1px 2px 3px 4px)')
    expect(contexts).toEqual([
      { purpose: 'print', width: 40 },
      { purpose: 'print', width: 600 },
    ])
  })

  test('draws and reports missing, invalid, and failed placements', async () => {
    const reports: unknown[] = []
    const output = await resolvePlacements(
      '<img data-segnavia-media="missing"><img data-segnavia-media="bad" data-segnavia-box="nope"><img data-segnavia-media="failed">',
      {
        resolvePlacement: async (placement) => {
          if (placement.address === 'failed') throw new Error('no renderer')
          return undefined
        },
        purpose: 'screen',
        width: 100,
        signal,
        report: (entry) => reports.push(entry),
      },
    )
    expect(output.match(/data-segnavia-placement="missing"/g)).toHaveLength(3)
    expect(reports).toEqual([
      expect.objectContaining({ address: 'bad', reason: 'invalid' }),
      { address: 'missing', page: undefined, reason: 'missing' },
      { address: 'failed', page: undefined, reason: 'failed', message: 'no renderer' },
    ])
  })

  test('rejects on abort', async () => {
    const controller = new AbortController()
    const work = resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => {
        controller.abort(new Error('stopped'))
        throw new Error('host stopped')
      },
      purpose: 'screen',
      width: 100,
      signal: controller.signal,
    })
    await expect(work).rejects.toThrow('stopped')
  })
})
