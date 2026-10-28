import { describe, expect, test } from 'bun:test'
import type { Motif, MotifPlacement, MotifSource } from '@segnavia/format'
import { expandMotifs, libraryMotifPlacementRefusal, MOTIF_DEPTH_LIMIT, MOTIF_PLACEMENT_LIMIT, MotifRefusedError, motifPlacementRefusals } from './motifs.ts'

const signal = new AbortController().signal

function source(motifs: Record<string, Motif>, data?: MotifSource['data']): MotifSource {
  return { motif: async (key) => motifs[key], data }
}

function options(motifs: Record<string, Motif>, extra: Partial<Parameters<typeof expandMotifs>[1]> = {}) {
  return { source: source(motifs), scripts: 'refuse' as const, prefix: 'live', signal, ...extra }
}

const letterhead: Motif = {
  key: 'letterhead',
  revision: 'r2',
  label: 'Letterhead',
  fields: [{ key: 'form', label: 'Form', choices: ['full', 'compact'], default: 'full', required: false }],
  versions: [{ lang: 'he', dir: 'ltr', html: '<p>שלום</p><script>bad()</script>' }],
  fonts: [{ app: 'Body' }],
}

const bilingual: Motif = {
  key: 'bilingual',
  revision: '1',
  label: 'Bilingual',
  fields: [],
  versions: [
    { lang: 'en', html: '<p>English</p>' },
    { lang: 'he', html: '<p>עברית</p>' },
  ],
  fonts: [],
}

describe('libraryMotifPlacementRefusal', () => {
  test.each(['<div DATA-MOTIF="segnavia:x"></div>', '<div data-motif=segnavia:x></div>', "<div data-motif='segnavia:x'></div>"])(
    'parses reserved placements in %s',
    (html) => {
      expect(libraryMotifPlacementRefusal(html)).toContain('reserved for library motifs; rename the motif key to clear this refusal')
    },
  )

  test('does not refuse a motif key containing the prefix later', () => {
    expect(libraryMotifPlacementRefusal('<div data-motif="host:segnavia:x"></div>')).toBeUndefined()
  })
})

describe('expandMotifs', () => {
  test.each([
    '<html lang=he><body><div data-motif="bilingual"></div></body></html>',
    '<html lang="he"><body><div data-motif="bilingual"></div></body></html>',
    '<html lang=\' he \'><body><div data-motif="bilingual"></div></body></html>',
  ])('uses the page language for expansion and refusal checks in %s', async (html) => {
    const motifOptions = options({ bilingual })
    const result = await expandMotifs(html, motifOptions)
    expect(result.placed).toEqual([{ key: 'bilingual', revision: '1', version: 1, lang: 'he', fields: {} }])
    expect(await motifPlacementRefusals(html, motifOptions)).toEqual([])
  })

  test('prefers an explicit language to the page language', async () => {
    const html = '<html lang="he"><body><div data-motif="bilingual"></div></body></html>'
    const motifOptions = options({ bilingual }, { lang: 'en' })
    const result = await expandMotifs(html, motifOptions)
    expect(result.placed).toEqual([{ key: 'bilingual', revision: '1', version: 0, lang: 'en', fields: {} }])
    expect(await motifPlacementRefusals(html, motifOptions)).toEqual([])
  })

  test.each(['', '  '])('uses the page language when the explicit language is empty (%j)', async (lang) => {
    const html = '<html lang="he"><body><div data-motif="bilingual"></div></body></html>'
    const motifOptions = options({ bilingual }, { lang })
    const result = await expandMotifs(html, motifOptions)
    expect(result.placed).toEqual([{ key: 'bilingual', revision: '1', version: 1, lang: 'he', fields: {} }])
    expect(await motifPlacementRefusals(html, motifOptions)).toEqual([])
  })

  test.each(['<html><body><div data-motif="bilingual"></div></body></html>', '<html lang="  "><body><div data-motif="bilingual"></div></body></html>'])(
    'still refuses a multi-language motif when the page language is absent in %s',
    async (html) => {
      const motifOptions = options({ bilingual })
      await expect(expandMotifs(html, motifOptions)).rejects.toThrow('no language was supplied and the motif has more than one language')
      expect(await motifPlacementRefusals(html, motifOptions)).toEqual([
        expect.stringContaining('no language was supplied and the motif has more than one language'),
      ])
    },
  )

  test('keeps an author data font in a version only when opted in', async () => {
    const font = '@font-face{font-family:x;src:url(data:font/woff2;base64,AA==)}'
    const styled: Motif = { ...letterhead, versions: [{ lang: 'en', html: `<style>${font}</style><b data-live-value="name"></b>` }] }
    const withData = { source: source({ styled }, async () => ({ name: 'held' })) }
    expect((await expandMotifs('<div data-motif="styled"></div>', { ...options({ styled }), ...withData })).html).not.toContain('@font-face')
    expect((await expandMotifs('<div data-motif="styled"></div>', { ...options({ styled }), ...withData, dataFonts: true })).html).toContain('@font-face')
  })

  test('expands in place, sanitizes content, and sets language direction', async () => {
    const result = await expandMotifs('<section class="held" data-motif="letterhead">old</section>', options({ letterhead }))
    expect(result.html).toBe('<section class="held" data-motif="letterhead" lang="he" dir="ltr"><p>שלום</p></section>')
    expect(result.placed).toEqual([{ key: 'letterhead', revision: 'r2', version: 0, lang: 'he', fields: { form: 'full' } }])
  })

  test('expands nested placements with the enclosing language', async () => {
    const outer: Motif = {
      key: 'outer',
      revision: '1',
      label: 'Outer',
      fields: [],
      versions: [{ lang: 'he', html: '<div data-motif="letterhead"></div>' }],
      fonts: [],
    }
    const result = await expandMotifs('<main data-motif="outer"></main>', options({ outer, letterhead }))
    expect(result.html).toContain('data-motif="letterhead" lang="he" dir="ltr"><p>שלום</p>')
    expect(result.placed.map(({ key }) => key)).toEqual(['outer', 'letterhead'])
  })

  test('fills each placement from contextual data and reports unavailable paths', async () => {
    const calls: MotifPlacement[] = []
    const named: Motif = {
      key: 'named',
      revision: '7',
      label: 'Named',
      fields: [{ key: 'name', label: 'Name', required: true }],
      versions: [{ lang: 'en', html: '<b data-live-value="issuer.name"></b><i data-live-value="missing"></i>' }],
      fonts: [],
    }
    const data = async (placement: MotifPlacement) => {
      calls.push(placement)
      return { issuer: { name: placement.fields.name } }
    }
    const result = await expandMotifs('<div data-motif="named" data-motif-name="Legal"></div>', {
      ...options({ named }),
      source: source({ named }, data),
    })
    expect(calls).toEqual([{ key: 'named', revision: '7', lang: 'en', fields: { name: 'Legal' } }])
    expect(result.html).toContain('<b dir="auto">Legal</b><i></i>')
    expect(result.unavailable).toEqual(['missing'])
  })

  test('passes pins only when supplied and deduplicates the font union', async () => {
    const requests: Array<{ key: string; revision?: string }> = []
    const shared = { app: 'Body' } as const
    const second: Motif = { ...letterhead, key: 'second', fonts: [shared, { local: 'Arial', fallback: 'Body' }] }
    const motifSource: MotifSource = {
      motif: async (key, request) => {
        requests.push({ key, ...(request.revision ? { revision: request.revision } : {}) })
        return { letterhead, second }[key]
      },
    }
    const html = '<div data-motif="letterhead"></div><div data-motif="second"></div>'
    const result = await expandMotifs(html, { ...options({}), source: motifSource, pins: { letterhead: 'r1' } })
    expect(requests).toEqual([{ key: 'letterhead', revision: 'r1' }, { key: 'second' }])
    expect(result.fonts).toEqual([shared, { local: 'Arial', fallback: 'Body' }])
  })

  test('reads pins as own properties and caches motif lookups', async () => {
    const requests: Array<{ key: string; revision?: string }> = []
    const motifSource: MotifSource = {
      motif: async (key, request) => {
        requests.push({ key, ...(request.revision === undefined ? {} : { revision: request.revision }) })
        return { ...letterhead, key }
      },
    }
    await expandMotifs('<div data-motif="__proto__"></div><div data-motif="__proto__"></div>', {
      ...options({}),
      source: motifSource,
      pins: { letterhead: 'r1' },
    })
    expect(requests).toEqual([{ key: '__proto__' }])
  })

  test('reserves the segnavia motif prefix for library furniture', async () => {
    let requested = false
    const motifSource: MotifSource = {
      motif: async () => {
        requested = true
        return { ...letterhead, key: 'segnavia:returned' }
      },
    }
    await expect(expandMotifs('<div data-motif="segnavia:folio"></div>', { ...options({}), source: motifSource })).rejects.toThrow(
      '"segnavia:" is reserved for library motifs; rename the motif key to clear this refusal',
    )
    expect(requested).toBe(false)

    await expect(expandMotifs('<div data-motif="host"></div>', { ...options({}), source: motifSource })).rejects.toThrow(
      'host MotifSource result key because "segnavia:" is reserved for library motifs; rename the motif key to clear this refusal',
    )

    const nested = { ...letterhead, versions: [{ lang: 'he', html: '<span data-motif="segnavia:running-head"></span>' }] }
    await expect(expandMotifs('<div data-motif="letterhead"></div>', options({ letterhead: nested }))).rejects.toThrow('reserved for library motifs')
  })

  test('matches camelCase field keys through case-insensitive HTML attributes', async () => {
    const named: Motif = {
      key: 'named',
      revision: '1',
      label: 'Named',
      fields: [{ key: 'issuerName', label: 'Issuer', required: true }],
      versions: [{ lang: 'en', html: '<b></b>' }],
      fonts: [],
    }
    const result = await expandMotifs('<div data-motif="named" data-motif-issuerName="Held"></div>', options({ named }))
    expect(result.placed[0]?.fields).toEqual({ issuerName: 'Held' })
  })

  test('keeps allowed authored and source-bound links while stripping other origins', async () => {
    const linked: Motif = {
      key: 'linked',
      revision: '1',
      label: 'Linked',
      fields: [],
      versions: [
        {
          lang: 'en',
          html: '<a href="https://allowed.example/authored">Authored</a><a href="https://outside.example/no">Outside</a><a data-live-href="issuer.url">Bound</a>',
        },
      ],
      fonts: [],
    }
    const result = await expandMotifs('<div data-motif="linked"></div>', {
      ...options({ linked }),
      linkOrigins: ['https://allowed.example'],
      source: source({ linked }, async () => ({ issuer: { url: 'https://bound.example/give' } })),
    })
    expect(result.html).toContain('href="https://allowed.example/authored"')
    expect(result.html).toContain('href="https://bound.example/give"')
    expect(result.html).not.toContain('https://outside.example/no')
  })

  test('refuses cycles and nesting beyond the limit', async () => {
    const cycle: Motif = {
      key: 'cycle',
      revision: '1',
      label: 'Cycle',
      fields: [],
      versions: [{ lang: 'en', html: '<div data-motif="cycle"></div>' }],
      fonts: [],
    }
    await expect(expandMotifs('<div data-motif="cycle"></div>', options({ cycle }))).rejects.toBeInstanceOf(MotifRefusedError)

    const motifs: Record<string, Motif> = {}
    for (let index = 0; index <= MOTIF_DEPTH_LIMIT; index += 1) {
      motifs[`level${index}`] = {
        key: `level${index}`,
        revision: '1',
        label: `Level ${index}`,
        fields: [],
        versions: [{ lang: 'en', html: index === MOTIF_DEPTH_LIMIT ? 'end' : `<div data-motif="level${index + 1}"></div>` }],
        fonts: [],
      }
    }
    await expect(expandMotifs('<div data-motif="level0"></div>', options(motifs))).rejects.toThrow(`nesting depth within ${MOTIF_DEPTH_LIMIT}`)
  })

  test('refuses live data on scripted pages but expands data-free motifs', async () => {
    const live: Motif = { ...letterhead, key: 'live', versions: [{ lang: 'en', html: '<b data-live-value="name"></b>' }] }
    const scripted = { ...options({ live }), source: source({ live }, async () => ({ name: 'held' })), scripts: 'sandboxed' as const }
    await expect(expandMotifs('<div data-motif="live"></div>', scripted)).rejects.toThrow('data-free motif version')
    expect(await motifPlacementRefusals('<div data-motif="live"></div>', scripted)).toHaveLength(1)
    expect((await expandMotifs('<div data-motif="letterhead"></div>', { ...options({ letterhead }), scripts: 'sandboxed' })).html).toContain('<p>שלום</p>')
  })

  test('bounds total placements and observes an aborted signal', async () => {
    const repeated = Array.from({ length: MOTIF_PLACEMENT_LIMIT + 1 }, () => '<i data-motif="letterhead"></i>').join('')
    await expect(expandMotifs(repeated, options({ letterhead }))).rejects.toThrow(`at most ${MOTIF_PLACEMENT_LIMIT}`)

    const controller = new AbortController()
    const abortingSource: MotifSource = {
      motif: async () => {
        controller.abort(new Error('stopped'))
        return letterhead
      },
    }
    await expect(expandMotifs('<div data-motif="letterhead"></div>', { ...options({}), source: abortingSource, signal: controller.signal })).rejects.toThrow(
      'stopped',
    )
  })
})

describe('motifPlacementRefusals', () => {
  test('reports placement details and actionable endings for every refusal', async () => {
    const required: Motif = {
      key: 'required',
      revision: '1',
      label: 'Required',
      fields: [{ key: 'form', label: 'Form', choices: ['full'], required: true }],
      versions: [{ lang: 'en', html: '' }],
      fonts: [],
    }
    const specific: Motif = {
      key: 'specific',
      revision: '1',
      label: 'Specific',
      fields: [{ key: 'form', label: 'Form', choices: ['full', 'compact'], required: true }],
      versions: [{ lang: 'en', when: { form: 'full' }, html: '' }],
      fonts: [],
    }
    const html = [
      '<div data-motif="missing" data-motif-lang="en"></div>',
      '<div data-motif="required" data-motif-extra="x"></div>',
      '<div data-motif="required"></div>',
      '<div data-motif="required" data-motif-form="compact"></div>',
      '<div data-motif="required" data-motif-lang="he" data-motif-form="full"></div>',
      '<div data-motif="specific" data-motif-lang="en" data-motif-form="compact"></div>',
    ].join('')
    const refusals = await motifPlacementRefusals(html, options({ required, specific }))
    expect(refusals).toHaveLength(6)
    for (const reason of refusals) {
      expect(reason).toContain('motif placement data-motif=')
      expect(reason.endsWith('to clear this refusal.')).toBe(true)
    }
  })
})
