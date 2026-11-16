import { describe, expect, test } from 'bun:test'
import type { DocumentInput, Media } from '@segnavia/format'
import { PlacementResolutionError, placementMissingEntry, placementPlan, type ResolvePlacement, resolvePlacements } from './placements.ts'
import { SoundPrintRefusedError } from './sound-print-refusal.ts'

const signal = new AbortController().signal
const media = (alt?: Media['alt']): Media => ({ format: 'png', size: { width: 20, height: 10 }, ...(alt ? { alt } : {}) })
const png = 'data:image/png;base64,AA=='
const svg = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'
const page = { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: '<p>Page</p>' } }] } satisfies DocumentInput

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
    expect(placementPlan('<img data-segnavia-media="a" data-segnavia-page="">').refusals[0]).toMatchObject({
      address: 'a',
      page: '',
    })
  })
})

describe('resolvePlacements', () => {
  test('collects placed sounds in document order before drawing print placeholders', async () => {
    const reports: unknown[] = []
    const work = resolvePlacements('<img data-segnavia-media="first"><img data-segnavia-media="second">', {
      resolvePlacement: async (placement) => ({
        kind: 'sound' as const,
        sound: { format: 'mp3' as const, durationMs: 1_000 },
        src: `data:audio/mpeg,${placement.address}`,
      }),
      purpose: 'print',
      width: 100,
      signal,
      report: (entry) => reports.push(entry),
    })
    try {
      await work
      throw new Error('expected sound print refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(SoundPrintRefusedError)
      expect((error as SoundPrintRefusedError).code).toBe('sound-print')
      expect((error as SoundPrintRefusedError).subject).toBe('first')
      expect((error as SoundPrintRefusedError).placements).toEqual(['first', 'second'])
      expect((error as SoundPrintRefusedError).refusals.map(({ subject }) => subject)).toEqual(['first', 'second'])
      expect((error as Error).message).toBe(
        'Placement first holds a sound, which cannot print. Remove the placement, or place an image of its cover instead, to clear this refusal.',
      )
    }
    expect(reports).toEqual([])
  })

  test('leaves a placed sound for the screen fallback path', async () => {
    const output = await resolvePlacements('<img data-segnavia-media="theme">', {
      resolvePlacement: async () => ({ kind: 'sound' as const, sound: { format: 'ogg' as const, durationMs: 500 }, src: 'data:audio/ogg,x' }),
      purpose: 'screen',
      width: 100,
      signal,
    })
    expect(output).toContain('data-segnavia-placement="missing"')
  })

  test('reports a non-media answer as invalid and draws the placeholder', async () => {
    const reports: unknown[] = []
    const output = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({ kind: 'page' as const, page }),
      purpose: 'screen',
      width: 100,
      signal,
      report: (entry) => reports.push(entry),
    })
    expect(output).toContain('data-segnavia-placement="missing"')
    expect(reports).toEqual([{ address: 'a', page: undefined, reason: 'invalid', message: 'resolved page, not media' }])
  })

  test('uses a failed resolver diagnostic in the preflight remedy', () => {
    expect(placementMissingEntry({ address: 'cover', page: undefined, reason: 'failed', message: 'asset service timed out' }).message).toBe(
      "Placement cover could not be resolved: asset service timed out; fix the placement's resolver answer to clear it.",
    )
  })
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

  test('marks a PDF print placeholder at the selected crop aspect while leaving screen and src-only answers unchanged', async () => {
    const pdf: Media = {
      format: 'pdf',
      size: { width: 600, height: 800 },
      pages: [{ boxes: { media: { x: 0, y: 0, width: 600, height: 800 }, crop: { x: 10, y: 20, width: 580, height: 760 } } }],
    }
    const resolve: ResolvePlacement = async () => ({ kind: 'media', media: pdf, src: png, bytes: new Uint8Array([1]) })
    const printed = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: resolve,
      purpose: 'print',
      width: 100,
      signal,
      pdfSources: new Map(),
    })
    expect(printed).toContain('data-segnavia-placed-pdf="1"')
    expect(printed).toContain('width%3D%22773.3333333333333%22%20height%3D%221013.3333333333333%22')
    const screen = await resolvePlacements('<img data-segnavia-media="a">', { resolvePlacement: resolve, purpose: 'screen', width: 100, signal })
    expect(screen).toContain(`src="${png}"`)
    expect(screen).not.toContain('data-segnavia-placed-pdf')
    const srcOnly = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({ kind: 'media', media: pdf, src: png }),
      purpose: 'print',
      width: 100,
      signal,
    })
    expect(srcOnly).toContain(`src="${png}"`)
  })

  test('draws the src rendition for a PDF print when no vector draw registry is present', async () => {
    const output = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({
        kind: 'media',
        media: { format: 'pdf', size: { width: 10, height: 20 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 20 } } }] },
        src: png,
        bytes: new Uint8Array([1]),
      }),
      purpose: 'print',
      width: 100,
      signal,
    })
    expect(output).toContain(`src="${png}"`)
    expect(output).not.toContain('data-segnavia-placed-pdf')
  })

  test('reports an unknown named PDF page and draws a placeholder', async () => {
    const reports: unknown[] = []
    const output = await resolvePlacements('<img data-segnavia-media="a" data-segnavia-page="Missing">', {
      resolvePlacement: async () => ({
        kind: 'media',
        media: { format: 'pdf', size: { width: 10, height: 10 }, pages: [{ boxes: { media: { x: 0, y: 0, width: 10, height: 10 } } }] },
        src: png,
        bytes: new Uint8Array([1]),
      }),
      purpose: 'print',
      width: 100,
      signal,
      pdfSources: new Map(),
      report: (entry) => reports.push(entry),
    })
    expect(output).toContain('data-segnavia-placement="missing"')
    expect(reports).toEqual([{ address: 'a', page: 'Missing', reason: 'no-page' }])
  })

  test('contains an application failure to its placement and continues applying answers', async () => {
    const reports: unknown[] = []
    const output = await resolvePlacements('<img data-segnavia-media="broken"><img data-segnavia-media="working">', {
      resolvePlacement: async (placement) =>
        placement.address === 'broken'
          ? {
              kind: 'media' as const,
              media: { format: 'pdf' as const, size: { width: 10, height: 10 }, pages: [{ boxes: {} }] },
              src: png,
              bytes: new Uint8Array([1]),
            }
          : { kind: 'media' as const, media: media(), src: png },
      purpose: 'print',
      width: 100,
      signal,
      pdfSources: new Map(),
      report: (entry) => reports.push(entry),
    })
    expect(output).toContain('data-segnavia-placement="missing"')
    expect(output).toContain(`<img src="${png}">`)
    expect(reports).toEqual([{ address: 'broken', page: undefined, reason: 'failed', message: expect.any(String) }])
  })

  test('accepts a line-wrapped base64 image source as the sanitizer does', async () => {
    const src = 'data:image/png;base64,AA\nBB'
    const output = await resolvePlacements('<img data-segnavia-media="a">', {
      resolvePlacement: async () => ({ kind: 'media', media: media(), src }),
      purpose: 'screen',
      width: 100,
      signal,
    })
    expect(output).not.toContain('data-segnavia-placement')
    expect(output).toContain('data:image/png;base64,AA\nBB')
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

  test('fills absent alt and resolved direction but does not label an authored alt', async () => {
    const resolver: ResolvePlacement = async (placement) => ({
      kind: 'media',
      media: media(placement.address === 'a' ? { text: 'שלום' } : { text: 'שלום', lang: 'he' }),
      src: png,
    })
    const output = await resolvePlacements(
      '<img data-segnavia-media="a"><img data-segnavia-media="b" alt="Author caption"><img data-segnavia-media="c" alt=""><img data-segnavia-media="d">',
      {
        resolvePlacement: resolver,
        purpose: 'screen',
        width: 100,
        signal,
      },
    )
    expect(output).toContain('alt="שלום" dir="rtl"')
    expect(output).toContain('alt="Author caption" src=')
    expect(output).toMatch(/<img alt(?:="")? src=/)
    expect(output.match(/lang="he" dir="rtl"/g)).toHaveLength(1)
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

  test.each(['encrypted', 'too-large'] as const)('draws and reports a resolver %s refusal with its structured reason', async (reason) => {
    const reports: unknown[] = []
    const output = await resolvePlacements('<img data-segnavia-media="source">', {
      resolvePlacement: async () => {
        throw new PlacementResolutionError(reason, `${reason} source`)
      },
      purpose: 'print',
      width: 100,
      signal,
      report: (entry) => reports.push(entry),
    })
    expect(output).toContain('data-segnavia-placement="missing"')
    expect(reports).toEqual([{ address: 'source', page: undefined, reason, message: `${reason} source` }])
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
