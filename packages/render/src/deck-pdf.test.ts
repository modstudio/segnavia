import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { DIAGRAMS_DRAWN_ATTRIBUTE } from '@segnavia/frame/diagrams'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { firstNotesPages, renderDeckPdf } from './deck-pdf.ts'
import { RenderRefusedError } from './errors.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'

async function onePage(width = 300, height = 150): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.addPage([width, height]).drawRectangle({ x: 0, y: 0, width, height })
  return pdf.save()
}

async function requestedPdf(html: string, pdf: Parameters<Tab['pdf']>[0]): Promise<Uint8Array> {
  const millimeters = (value: string | number | undefined, fallback: number) =>
    typeof value === 'string' && value.endsWith('mm') ? (Number.parseFloat(value) * 72) / 25.4 : fallback
  const width = millimeters(pdf?.width, 300)
  const height = millimeters(pdf?.height, 150)
  const output = await PDFDocument.create()
  const pages = html.includes('<section class="sheet') ? 2 : 1
  for (let index = 0; index < pages; index++) output.addPage([width, height]).drawRectangle({ x: 0, y: 0, width: 1, height: 1 })
  return output.save()
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

test('deck sheet bleed writes press boxes on every slide at the 96 dpi trim', async () => {
  const output = await renderDeckPdf(
    deck,
    { sheet: { bleed: 3 } },
    {
      renderPdf: async (setup, pdf) => requestedPdf(setup.html, pdf),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const pages = (await PDFDocument.load(output)).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.getBleedBox()).toBeDefined()
    expect(page.getTrimBox()).toMatchObject({ width: 300, height: 150 })
  }
})

test('plain deck sheets have no press boxes', async () => {
  const output = await renderDeckPdf(
    deck,
    {},
    {
      renderPdf: async (setup, pdf) => requestedPdf(setup.html, pdf),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  for (const page of (await PDFDocument.load(output)).getPages()) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(false)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(false)
    expect(page.node.has(PDFName.of('ArtBox'))).toBe(false)
  }
})

test('notesPaper bleed writes press boxes on every notes sheet', async () => {
  const output = await renderDeckPdf(
    deck,
    { layout: 'notes', notesPaper: { paper: 'letter', bleed: 3 } },
    {
      renderPdf: async (setup, pdf) => requestedPdf(setup.html, pdf),
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    },
  )
  const pages = (await PDFDocument.load(output)).getPages()
  expect(pages).toHaveLength(2)
  for (const page of pages) {
    expect(page.node.has(PDFName.of('BleedBox'))).toBe(true)
    expect(page.node.has(PDFName.of('TrimBox'))).toBe(true)
  }
})

test('deck press settings refuse incompatible options before rendering', async () => {
  const services = {
    renderPdf: async () => onePage(),
    fontFaces: () => '',
    finish: async (pdf: Uint8Array) => pdf,
  }
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, imposition }, services)).rejects.toThrow('Remove sheet, or remove imposition')
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, layout: 'notes' }, services)).rejects.toThrow('use notesPaper')
  await expect(renderDeckPdf(deck, { sheet: { bleed: 3 }, preferCssPageSize: true }, services)).rejects.toThrow('Remove preferCssPageSize')
})

test('invalid deck sheet press values name the setting and remedy', async () => {
  const services = {
    renderPdf: async () => onePage(),
    fontFaces: () => '',
    finish: async (pdf: Uint8Array) => pdf,
  }
  await expect(renderDeckPdf(deck, { sheet: { bleed: -1 } }, services)).rejects.toThrow('sheet setting is invalid')
  await expect(renderDeckPdf(deck, { sheet: { bleed: -1 } }, services)).rejects.toThrow('Correct sheet.bleed, or remove sheet')
  await expect(renderDeckPdf(deck, { sheet: { markColor: 'registration' } }, services)).rejects.toThrow('Correct sheet.markColor, or remove sheet')
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
