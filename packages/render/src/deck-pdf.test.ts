import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { DIAGRAMS_DRAWN_ATTRIBUTE } from '@segnavia/frame/diagrams'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import { PDFDocument } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { firstNotesPages, renderDeckPdf } from './deck-pdf.ts'
import { RenderRefusedError } from './errors.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { resolveRenderPreflight } from './preflight.ts'

async function onePage(width = 300, height = 150): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height })
  return pdf.save()
}

const deck = Deck.parse({
  title: 'Deck',
  size: { width: 400, height: 200 },
  slides: [
    { id: 'html-slide', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'image-slide', content: { kind: 'image', src: 'image.png', alt: 'Image' } },
  ],
})

test('notes page ownership places each thumbnail only on its first sheet', () => {
  expect(firstNotesPages([0, 0, 1, 1, 1, 2], 3)).toEqual([0, 2, 5])
})

test('deck PDF renders HTML slides separately and enforces only the composition', async () => {
  const base = await PDFDocument.create()
  base.addPage([300, 150])
  base.addPage([300, 150])
  const documents: string[] = []
  const limitsSeen: unknown[] = []
  const output = await renderDeckPdf(
    deck,
    { limits: { sheets: 2 } },
    {
      renderPdf: async (setup) => {
        documents.push(setup.html)
        return setup.html.includes('<section class="sheet">') ? base.save() : onePage()
      },
      fontFaces: () => '',
      finish: async (pdf, options) => {
        limitsSeen.push(options.limits)
        return pdf
      },
    },
  )
  expect((await PDFDocument.load(output)).getPageCount()).toBe(2)
  expect(documents).toHaveLength(2)
  expect(documents[0]).not.toContain('<iframe')
  const htmlSlide = documents.find((html) => html.includes('<p>HTML</p>')) ?? ''
  expect(htmlSlide).toContain('var printAt=0')
  expect(htmlSlide).toContain('animation-play-state:paused!important')
  expect(htmlSlide).toContain('window.requestAnimationFrame(function(){window.requestAnimationFrame')
  expect(limitsSeen).toEqual([{ sheets: 2 }])
})

test.each([
  ['default', 'warnings'],
  ['strict', 'refuses'],
] as const)('deck PDF %s preflight reports an overset slide and %s', async (profile, outcome) => {
  const reports: Array<{ issues: Array<{ location?: { folio?: string } }>; coverage: unknown }> = []
  const rendering = renderDeckPdf(
    deck,
    { preflight: resolveRenderPreflight({ profile, report: (report) => reports.push(report) }) },
    {
      renderPdf: async (setup) => {
        setup.preflightReport?.({ fontFailures: [], slotFits: [{ title: 'overflowed' }] })
        return setup.html.includes('<section class="sheet">') ? onePage(300, 150).then(async (first) => {
          const pdf = await PDFDocument.load(first)
          pdf.addPage([300, 150])
          return pdf.save()
        }) : onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  if (outcome === 'refuses') await expect(rendering).rejects.toThrow('Slot title is overset')
  else await expect(rendering).resolves.toBeInstanceOf(Uint8Array)
  expect(reports).toHaveLength(1)
  expect(reports[0]?.issues[0]?.location).toEqual({ folio: '1' })
  expect(reports[0]?.coverage).toEqual({ measured: 2, total: 2 })
})

test('the print bridge and PDF waiter share one ready signal', async () => {
  let htmlSlide = ''
  let beforeOutput: ((tab: Tab) => Promise<void>) | undefined
  await renderDeckPdf(
    deck,
    {},
    {
      renderPdf: async (setup) => {
        if (!setup.html.includes('<section class="sheet">')) {
          htmlSlide = setup.html
          beforeOutput = setup.beforeOutput
        }
        return onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )

  expect(htmlSlide).toContain(`setAttribute('${PRINT_READY_ATTRIBUTE}','')`)
  let selector = ''
  let timeout = 0
  const tab = {
    locator: (value: string) => {
      selector = value
      return {
        waitFor: (options: { timeout: number }) => {
          timeout = options.timeout
          return Promise.resolve()
        },
      }
    },
  } as unknown as Tab
  await beforeOutput?.(tab)
  expect(selector).toBe(`html[${PRINT_READY_ATTRIBUTE}]`)
  expect(timeout).toBe(SLIDES_READY_DEADLINE_MS)
})

test('deck PDF refuses a diagram slide that does not finish drawing', async () => {
  const diagramDeck = Deck.parse({
    ...deck,
    slides: [{ id: 'diagram-slide', content: { kind: 'html', html: '<pre data-segnavia-diagram="mermaid"></pre>' } }],
  })
  let diagramTimeout = 0
  const rendering = renderDeckPdf(
    diagramDeck,
    {},
    {
      renderPdf: async (setup) => {
        if (!setup.html.includes('<section class="sheet">')) {
          const tab = {
            locator: (selector: string) => ({
              waitFor: (options: { timeout: number }) => {
                if (selector !== `html[${DIAGRAMS_DRAWN_ATTRIBUTE}]`) return Promise.resolve()
                diagramTimeout = options.timeout
                return Promise.reject(new Error('timeout'))
              },
            }),
          } as unknown as Tab
          await setup.beforeOutput?.(tab)
        }
        return onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    'DRAW',
  )

  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  expect(diagramTimeout).toBe(PAGE_READY_BOUND_MS)
  await expect(rendering).rejects.toThrow(
    'Slide "diagram-slide" could not be rendered: The page\'s diagrams did not finish drawing within 10s. Correct or simplify the diagram source so it draws within the bound to clear this refusal.',
  )
})

test('deck PDF does not wait for an undrawn diagram when page readiness is disabled', async () => {
  const diagramDeck = Deck.parse({
    ...deck,
    slides: [{ id: 'diagram-slide', content: { kind: 'html', html: '<pre data-segnavia-diagram="mermaid"></pre>' } }],
  })
  let diagramWaits = 0
  await renderDeckPdf(
    diagramDeck,
    { waitForPageReady: false },
    {
      renderPdf: async (setup) => {
        if (!setup.html.includes('<section class="sheet">')) {
          const tab = {
            locator: (selector: string) => ({
              waitFor: () => {
                if (selector === `html[${DIAGRAMS_DRAWN_ATTRIBUTE}]`) diagramWaits++
                return Promise.resolve()
              },
            }),
          } as unknown as Tab
          await setup.beforeOutput?.(tab)
        }
        return onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
    'DRAW',
  )

  expect(diagramWaits).toBe(0)
})

test('a failed HTML slide render names the slide id', async () => {
  const rendering = renderDeckPdf(
    deck,
    {},
    {
      renderPdf: async (setup) => {
        if (!setup.html.includes('<section class="sheet">')) throw new Error('paint failed')
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toThrow('Slide "html-slide" could not be rendered: paint failed')
})

const imposition = {
  paper: { width: 120, height: 80, unit: 'mm' as const },
  orientation: 'landscape' as const,
  columns: 2,
  rows: 1,
  cell: { width: 40, height: 60 },
  margin: { top: 10, right: 15, bottom: 10, left: 15 },
  gap: { column: 10, row: 0 },
}

test('an imposed deck renders every slide alone and enforces the composed papers once', async () => {
  const documents: Array<{ html: string; beforeOutput: unknown }> = []
  const limitsSeen: unknown[] = []
  const output = await renderDeckPdf(
    deck,
    { imposition, limits: { sheets: 1 }, beforeOutput: async () => {} },
    {
      renderPdf: async (setup) => {
        documents.push({ html: setup.html, beforeOutput: setup.beforeOutput })
        return onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf, options) => {
        limitsSeen.push(options.limits)
        return pdf
      },
    },
  )
  const pdf = await PDFDocument.load(output)
  expect(pdf.getPageCount()).toBe(1)
  expect(documents).toHaveLength(2)
  expect(documents[0]?.html).toContain('<p>HTML</p>')
  expect(documents[0]?.html).not.toContain('<iframe')
  expect(documents[1]?.html).toContain('<img src="image.png"')
  expect(documents.map(({ beforeOutput }) => typeof beforeOutput)).toEqual(['function', 'function'])
  expect(limitsSeen).toEqual([{ sheets: 1 }])
})

test('an imposed repeat deck embeds one rendered slide across each paper', async () => {
  const single: Deck = { ...deck, slides: [deck.slides[0] as (typeof deck.slides)[number]] }
  let renders = 0
  const output = await renderDeckPdf(
    single,
    { imposition: { ...imposition, fill: 'repeat' } },
    {
      renderPdf: async () => {
        renders++
        return onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect(renders).toBe(1)
  expect((await PDFDocument.load(output)).getPageCount()).toBe(1)
})

test('an imposed deck with registration marks strokes Separation All', async () => {
  const output = await renderDeckPdf(
    deck,
    { imposition: { ...imposition, marks: true, markColor: 'registration' } },
    {
      renderPdf: async () => onePage(400, 200),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const text = await pageContent(output)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})

test('a two-sided imposed deck emits front and back PDF pages for one physical paper', async () => {
  const output = await renderDeckPdf(
    deck,
    { imposition: { ...imposition, sides: 'two' } },
    {
      renderPdf: async () => onePage(400, 200),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  expect((await PDFDocument.load(output)).getPageCount()).toBe(2)
})

test('an imposed deck refuses notes before rendering', async () => {
  let renders = 0
  const rendering = renderDeckPdf(
    deck,
    { layout: 'notes', imposition },
    {
      renderPdf: async () => {
        renders++
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow("layout: 'notes' and imposition cannot be combined")
  expect(renders).toBe(0)
})

test('deck PDF continues with fallback for an unknown notesFont', async () => {
  let renders = 0
  const rendering = renderDeckPdf(
    deck,
    { layout: 'notes', notesFont: 'missing', fontSource: { font: async () => undefined } },
    {
      renderPdf: async () => {
        renders++
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await rendering
  expect(renders).toBeGreaterThan(0)
})

test('deck PDF refuses a named notesFont with no FontSource before rendering', async () => {
  let renders = 0
  const rendering = renderDeckPdf(
    deck,
    { layout: 'notes', notesFont: 'serif' },
    {
      renderPdf: async () => {
        renders++
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow('notes could not establish app font "serif"; supply a FontSource to clear this refusal.')
  expect(renders).toBe(0)
})

test('deck PDF refuses an empty notesFont before rendering', async () => {
  let renders = 0
  const rendering = renderDeckPdf(
    deck,
    { layout: 'notes', notesFont: '' },
    {
      renderPdf: async () => {
        renders++
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toBeInstanceOf(RenderRefusedError)
  await expect(rendering).rejects.toThrow(
    'notes could not establish an app font name matching /^[a-z0-9-]+$/ (""); use a lowercase name of letters, digits and hyphens to clear this refusal.',
  )
  expect(renders).toBe(0)
})

test('deck PDF puts the named notes face in the notes head', async () => {
  const documents: string[] = []
  const serif = {
    family: 'Body Serif',
    faces: [{ family: 'Body Serif', data: new Uint8Array([0]), format: 'truetype' as const }],
    generic: 'serif' as const,
  }
  const notes = await PDFDocument.create()
  notes.addPage([816, 1056])
  notes.addPage([816, 1056])
  await renderDeckPdf(
    deck,
    { layout: 'notes', notesFont: 'serif', fontSource: { font: async (name) => (name === 'serif' ? serif : undefined) } },
    {
      renderPdf: async (setup) => {
        documents.push(setup.html)
        return setup.html.includes('data-notes-source') ? notes.save() : onePage(400, 200)
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const html = documents.find((document) => document.includes('data-notes-source')) ?? ''
  expect(html).toContain('font:15px/1.5 var(--segnavia-font-serif);')
  expect(html).toContain('@font-face{font-family:"Body Serif";src:url(data:font/ttf;base64,AA==) format("truetype")')
  expect(html).not.toContain('system-ui')
})

test('a failed non-HTML slide render names the slide id', async () => {
  const rendering = renderDeckPdf(
    deck,
    { imposition },
    {
      renderPdf: async (setup) => {
        if (setup.html.includes('<img')) throw new Error('image failed')
        return onePage()
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  await expect(rendering).rejects.toThrow('Slide "image-slide" could not be rendered: image failed')
})
