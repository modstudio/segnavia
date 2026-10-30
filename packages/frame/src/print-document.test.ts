import { describe, expect, test } from 'bun:test'
import { Deck, fitPage, Imposition, impose, Page } from '@segnavia/format'
import {
  htmlSlideDocument,
  notesLayoutGeometry,
  printableDeck,
  printableDeckDocument,
  printablePages,
  printablePagesDocument,
  printablePaper,
} from './print-document.ts'
import { escapeHtml } from './svg.ts'

const grid = Imposition.parse({
  paper: { width: 26, height: 26, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 10, height: 10 },
  margin: { top: 2, right: 2, bottom: 2, left: 2 },
  gap: { column: 2, row: 2 },
  bleed: 1,
  safe: 0.5,
})
const fluid = Page.parse({ html: '<p>page</p>' })
const deck = Deck.parse({
  title: 'Print',
  size: { width: 1280, height: 720 },
  slides: [{ id: 'html', content: { kind: 'html', html: '<h1>Slide</h1>' }, notes: 'Notes' }],
})

describe('printableDeck', () => {
  const handout = Imposition.parse({
    paper: { width: 230, height: 320, unit: 'mm' },
    columns: 2,
    rows: 3,
    cell: { width: 100, height: 80 },
    margin: { top: 20, right: 10, bottom: 20, left: 10 },
    gap: { column: 10, row: 20 },
    bleed: 3,
  })

  test('reports the notes sheet and thumbnail geometry in CSS pixels', () => {
    const geometry = notesLayoutGeometry(deck.size)
    expect(geometry.sheet.width).toBeCloseTo(816)
    expect(geometry.sheet.height).toBeCloseTo(1056)
    expect(geometry.border).toBe(1)
    expect(geometry.slide.x).toBe(49)
    expect(geometry.slide.y).toBe(49)
    expect(geometry.slide.width).toBeCloseTo(720)
    expect(geometry.slide.height).toBeCloseTo(405)
    expect(geometry.slide.scale).toBeCloseTo(0.5625)
    const printable = printableDeck(deck, { layout: 'notes' })
    expect(printable).toContain('box-sizing:border-box;padding:48px;')
    expect(printable).toContain('.slide{border:1px solid #ccc;')
    expect(printable).toContain('display:flex;flex-direction:column')
    expect(printable).toContain('.notes{min-height:0;flex:1;overflow:hidden;overflow-wrap:anywhere;')
    expect(printable).not.toMatch(/\.notes\{height:/)
    expect(printable).toContain('<bdi dir="ltr">1</bdi>')
  })

  test('leaves visible notes space below a portrait slide', () => {
    const geometry = notesLayoutGeometry({ width: 720, height: 1280 })
    const innerHeight = geometry.sheet.height - 96
    expect(geometry.slide.height).toBeLessThan(innerHeight)
    expect(innerHeight - geometry.slide.height).toBeGreaterThanOrEqual(96)
  })

  test('writes an escaped title into both the slides and notes documents', () => {
    const named = printableDeck(deck)
    const notes = printableDeck(deck, { layout: 'notes' })
    const imposed = printableDeckDocument(deck, { imposition: handout, nonce: 'known' }).html
    expect(named).toContain('<title>Print</title>')
    expect(notes).toContain('<title>Print</title>')
    expect(imposed).toContain('<title>Print</title>')
    const override = printableDeck(deck, { title: 'Handout' })
    expect(override).toContain('<title>Handout</title>')
    expect(override).not.toContain('<title>Print</title>')
    const unsafe = printableDeck(deck, { title: '</title><script>evil()</script>' })
    expect(unsafe).toContain('<title>&lt;/title&gt;&lt;script&gt;evil()&lt;/script&gt;</title>')
    expect(unsafe).not.toContain('<script>evil()')
    const untitled = printableDeck({ ...deck, title: '' })
    expect(untitled).not.toContain('<title>')
    expect(printableDeck(deck, { title: '' })).not.toContain('<title>')
  })

  test('prints speaker notes before narration and falls back only when notes are absent', () => {
    const narration = (text: string) => ({ text, words: [], durationMs: 0, audio: null })
    const withBoth = Deck.parse({
      ...deck,
      slides: [{ ...deck.slides[0], notes: 'Speaker notes win', narration: narration('Narration loses') }],
    })
    const withNarration = Deck.parse({
      ...deck,
      slides: [{ ...deck.slides[0], notes: undefined, narration: narration('Narration fallback') }],
    })
    expect(printableDeck(withBoth, { layout: 'notes' })).toContain('Speaker notes win')
    expect(printableDeck(withBoth, { layout: 'notes' })).not.toContain('Narration loses')
    expect(printableDeck(withNarration, { layout: 'notes' })).toContain('Narration fallback')
  })

  test('prints a placeholder only when some slides have notes and others do not', () => {
    const narration = (text: string) => ({ text, words: [], durationMs: 0, audio: null })
    const html = (id: string) => ({ id, content: { kind: 'html' as const, html: id } })
    const notesOf = (document: string) => [...document.matchAll(/<div class="notes" dir="auto">([\s\S]*?)<\/div>/g)].map((match) => match[1])
    const mixed = Deck.parse({
      ...deck,
      slides: [{ ...html('a'), notes: 'Has notes' }, html('b')],
    })
    expect(notesOf(printableDeck(mixed, { layout: 'notes' }))).toEqual(['Has notes', 'No speaker notes'])
    const empty = Deck.parse({
      ...deck,
      slides: [html('a'), html('b')],
    })
    expect(notesOf(printableDeck(empty, { layout: 'notes' }))).toEqual(['', ''])
    const spoken = Deck.parse({
      ...deck,
      slides: [{ ...html('a'), narration: narration('Spoken') }, html('b')],
    })
    expect(notesOf(printableDeck(spoken, { layout: 'notes' }))).toEqual(['Spoken', 'No speaker notes'])
    expect(notesOf(printableDeck(mixed, { layout: 'notes', labels: { noSpeakerNotes: 'אין הערות' } }))).toEqual(['Has notes', 'אין הערות'])
  })

  test('escapes notes without adding executable code to the print document', () => {
    const unsafe = Deck.parse({
      ...deck,
      slides: [{ ...deck.slides[0], notes: '<img src=x onerror=evil()> & final line' }],
    })
    const html = printableDeck(unsafe, { layout: 'notes' })
    expect(html).toContain('&lt;img src=x onerror=evil()&gt; &amp; final line')
    expect(html).not.toContain('<img src=x onerror=evil()>')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('segnaviaNotesReady')
  })

  test('injects exact print color into each sandboxed slide document', () => {
    const document = htmlSlideDocument(deck, '<style>body{background:red}</style>', { nonce: 'known' })
    expect(document).toContain('print-color-adjust:exact')
    expect(document).toContain('-webkit-print-color-adjust:exact')
    expect(document).toContain('data-segnavia-print-background')
  })

  test('freezes built HTML slide documents at their chosen print moments and leaves URL slides alone', () => {
    const timed = Deck.parse({
      ...deck,
      slides: [
        { id: 'start', content: { kind: 'html', html: '<p>Start</p>' } },
        { id: 'later', content: { kind: 'html', html: '<p>Later</p>' }, printAtMs: 500 },
        { id: 'url', content: { kind: 'url', src: 'https://example.invalid/slide' } },
      ],
    })
    const html = printableDeck(timed, { nonce: 'known' })
    expect(html).toContain('var printAt=0')
    expect(html).toContain('var printAt=500')
    expect(html).toContain('src="https://example.invalid/slide"')
    expect(html.match(/var printAt=/g)).toHaveLength(2)
  })

  test('builds the same top-level HTML slide document used by its frame', () => {
    const document = htmlSlideDocument(deck, '<h1>Slide</h1>', { nonce: 'known', css: 'h1{color:red}' })
    const printable = printableDeck(deck, { nonce: 'known', css: 'h1{color:red}' })
    expect(printable).toContain(`srcdoc="${escapeHtml(document)}"`)
    expect(document).not.toContain('segnavia:height')
    expect(document).toContain('var keys=[]')
  })

  test('leaves an HTML slide box empty without changing any surrounding layout', () => {
    const shown = printableDeck(deck, { nonce: 'known' })
    const empty = printableDeck(deck, { nonce: 'known', omitHtmlSlideFrames: true })
    expect(shown.replace(/<iframe[\s\S]*?<\/iframe>/, '')).toBe(empty)
    expect(empty).toContain('<section class="sheet"></section>')
  })

  test('keeps every output byte unchanged when frame omission is off', () => {
    expect(printableDeck(deck, { nonce: 'known', omitHtmlSlideFrames: false })).toBe(printableDeck(deck, { nonce: 'known' }))
  })

  test('keeps every output byte unchanged when imposition is off', () => {
    expect(printableDeck(deck, { nonce: 'known', imposition: undefined })).toBe(printableDeck(deck, { nonce: 'known' }))
  })

  test('uses shared fitted-layer geometry for shots and natural image geometry after load', () => {
    const tallShot = {
      key: 'tall',
      title: 'Tall shot',
      file: 'tall.png',
      size: { width: 1280, height: 2400 },
      scale: 1,
      capturedAt: 'now',
      annotations: [{ ring: { x: 100, y: 2100, width: 200, height: 100 }, badge: null, arrow: null }],
    }
    const fitted = Deck.parse({
      title: 'Fits',
      frame: true,
      slides: [
        { id: 'shot', content: { kind: 'shot', src: 'tall.png', shot: tallShot, fit: 'focus', frame: false } },
        { id: 'image', content: { kind: 'image', src: 'plain.png', alt: 'Plain image', fit: 'width' } },
        { id: 'framed-shot', content: { kind: 'shot', src: 'wide.png', shot: { ...tallShot, size: { width: 1280, height: 400 }, annotations: [] } } },
      ],
    })
    const html = printableDeck(fitted)
    expect(html).toContain('transform:translate(0px,-1680px) scale(1)')
    expect(html).toContain('viewBox="0 0 1280 2400"')
    expect(html).toContain('data-fit="width"')
    expect(html).not.toContain('onload=')
    expect(html).not.toContain('<script>')
    expect(html).toContain('data-frame="true"')
    expect(html).toContain('border-radius:15.342465753424658px')
    expect(html).not.toContain('object-fit')
  })

  test('builds two papers and every bleed box for seven slides on a two by three grid', () => {
    const seven = Deck.parse({
      ...deck,
      slides: Array.from({ length: 7 }, (_, index) => ({ id: `s${index}`, content: { kind: 'html' as const, html: `${index}` } })),
    })
    const imposed = impose(handout, seven.slides.length)
    const printable = printableDeckDocument(seven, { imposition: handout, nonce: 'known' })
    const html = printableDeck(seven, { imposition: handout, nonce: 'known' })
    expect(printable.html).toBe(html)
    expect(printable.imposed).toEqual(imposed)
    expect(html.match(/<section class="paper"/g)).toHaveLength(2)
    expect(html.match(/<div class="placement"/g)).toHaveLength(7)
    for (const placement of imposed.placements) {
      expect(html).toContain(
        `left:${placement.bleedBox.x}mm;top:${placement.bleedBox.y}mm;width:${placement.bleedBox.width}mm;height:${placement.bleedBox.height}mm;overflow:hidden`,
      )
    }
  })

  test.each(['contain', 'cover'] as const)('places and scales a %s slide from the shared page geometry', (mode) => {
    const imposition = Imposition.parse({ ...handout, fit: mode })
    const placement = impose(imposition, 1).placements[0]
    if (!placement) throw new Error('Expected one placement.')
    const fit = fitPage({ size: deck.size }, placement, mode)
    const html = printableDeck(deck, { imposition, nonce: 'known' })
    expect(html).toContain(
      `width:${deck.size.width}px;height:${deck.size.height}px;left:${fit.x - placement.bleedBox.x}mm;top:${fit.y - placement.bleedBox.y}mm;transform:scale(${fit.scale})`,
    )
  })

  test('keeps image and shot slides inside their placement boxes', () => {
    const mixed = Deck.parse({
      ...deck,
      slides: [
        { id: 'image', content: { kind: 'image', src: 'image.png', alt: 'Image slide' } },
        {
          id: 'shot',
          content: {
            kind: 'shot',
            src: 'shot.png',
            shot: { key: 'shot', title: 'Shot slide', file: 'shot.png', size: deck.size, scale: 1, capturedAt: 'now', annotations: [] },
          },
        },
      ],
    })
    const html = printableDeck(mixed, { imposition: handout })
    expect(html).toContain('alt="Image slide"')
    expect(html).toContain('alt="Shot slide"')
    expect(html.match(/<div class="placement"/g)).toHaveLength(2)
  })

  test('leaves an imposed HTML slide box in place when its frame is omitted', () => {
    const html = printableDeck(deck, { imposition: handout, omitHtmlSlideFrames: true })
    expect(html).toContain('<div class="placement"')
    expect(html).not.toContain('<iframe')
  })

  test('refuses notes together with an imposition', () => {
    expect(() => printableDeck(deck, { layout: 'notes', imposition: handout })).toThrow(
      new RangeError("layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal."),
    )
  })
})

describe('printablePages', () => {
  test('wraps the concatenated per-paper placement boxes', () => {
    const pages = [fluid, fluid, fluid, fluid, fluid]
    const imposed = impose(grid, pages.length)
    const content = Array.from({ length: imposed.papers }, (_, paper) => printablePaper(pages, grid, imposed, paper, { nonce: 'test' })).join('')
    const printable = printablePagesDocument(pages, grid, { nonce: 'test' })
    const wrapped = printable.html.match(/<body>([\s\S]*)<\/body>/)?.[1]?.replace(/<\/?section(?: class="paper" data-side="front")?>/g, '')
    expect(wrapped).toBe(content)
    expect(printable.imposed).toEqual(imposed)
    expect(printablePages(pages, grid, { nonce: 'test' })).toBe(printable.html)
    expect(printable.html).toContain('data-segnavia-print-background')
  })

  test('builds papers with every placement clipped to its bleed box', () => {
    const html = printablePages([fluid, fluid, fluid, fluid, fluid], grid, { nonce: 'test' })
    expect(html).toContain('@page{size:26mm 26mm;margin:0}')
    expect(html.match(/<section class="paper"/g)).toHaveLength(2)
    for (const box of [
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 1, y: 13 },
      { x: 13, y: 13 },
    ]) {
      expect(html).toContain(`left:${box.x}mm;top:${box.y}mm;width:12mm;height:12mm;overflow:hidden`)
    }
  })

  test('insets a fluid page by its physical, uneven bleed', () => {
    const imposition = Imposition.parse({
      paper: { width: 12, height: 13, unit: 'mm' },
      columns: 1,
      rows: 1,
      cell: { width: 10, height: 10 },
      margin: { top: 2, right: 0, bottom: 1, left: 2 },
      bleed: 3,
      safe: 1,
    })
    const html = printablePages([fluid], imposition, { css: ':root{color:red}', nonce: 'test' })
    expect(html).toContain(':where(html){padding:2mm 0mm 1mm 2mm}')
    expect(html.indexOf('--segnavia-safe:1mm')).toBeLessThan(html.indexOf(':where(html){padding:'))
    expect(html.indexOf(':where(html){padding:')).toBeLessThan(html.indexOf(':root{color:red}'))
  })

  test('builds front and back blocks with the back at its mirrored position', () => {
    const twoSided = Imposition.parse({
      paper: { width: 100, height: 150, unit: 'mm' },
      columns: 1,
      rows: 1,
      cell: { width: 30, height: 40 },
      margin: { top: 20, right: 60, bottom: 90, left: 10 },
      sides: 'two',
      flip: 'long',
    })
    const pages = [Page.parse({ html: '<p>front</p>' }), Page.parse({ html: '<p>back</p>' })]
    const imposed = impose(twoSided, pages.length)
    const front = imposed.placements.find((placement) => placement.side === 'front')
    const back = imposed.placements.find((placement) => placement.side === 'back')
    if (!front || !back) throw new Error('Expected front and back placements.')
    const printable = printablePagesDocument(pages, twoSided, { nonce: 'test' }).html
    const blocks = [...printable.matchAll(/<section class="paper" data-side="(front|back)">([\s\S]*?)<\/section>/g)]
    expect(blocks.map((match) => match[1])).toEqual(['front', 'back'])
    expect(blocks[0]?.[2]).toContain(`left:${front.bleedBox.x}mm;top:${front.bleedBox.y}mm`)
    expect(blocks[1]?.[2]).toContain(`left:${back.bleedBox.x}mm;top:${back.bleedBox.y}mm`)

    const twoSlides = Deck.parse({
      ...deck,
      slides: [
        { id: 'front', content: { kind: 'html', html: '<p>front</p>' } },
        { id: 'back', content: { kind: 'html', html: '<p>back</p>' } },
      ],
    })
    expect(printableDeckDocument(twoSlides, { imposition: twoSided, nonce: 'test' }).html.match(/<section class="paper"/g)).toHaveLength(2)
  })

  test.each(['contain', 'cover'] as const)('places and scales a fixed page with %s', (mode) => {
    const imposition = Imposition.parse({
      paper: { width: 120, height: 90, unit: 'mm' },
      orientation: 'landscape',
      columns: 1,
      rows: 1,
      cell: { width: 100, height: 70 },
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      bleed: 3,
      fit: mode,
    })
    const page = Page.parse({ html: '<p>fixed</p>', size: { width: 600, height: 400 } })
    const placement = impose(imposition, 1).placements[0]
    if (!placement) throw new Error('Expected one placement.')
    const fit = fitPage(page, placement, mode)
    const html = printablePages([page], imposition, { nonce: 'test' })
    expect(html).toContain(
      `width:600px;height:400px;left:${fit.x - placement.bleedBox.x}mm;top:${fit.y - placement.bleedBox.y}mm;transform:scale(${fit.scale})`,
    )
  })

  test('scales a fixed-width growing page to the trim height', () => {
    const page = Page.parse({ html: '<p>growing</p>', size: { width: 600, height: 'auto' } })
    const placement = impose(grid, 1).placements[0]
    if (!placement) throw new Error('Expected one placement.')
    const fit = fitPage(page, placement, grid.fit)
    const html = printablePages([page], grid, { nonce: 'test' })
    expect(html).toContain(`width:600px;height:${(placement.trim.height * (96 / 25.4)) / fit.scale}px`)
    expect(html).toContain(`left:${placement.trim.x - placement.bleedBox.x}mm;top:${placement.trim.y - placement.bleedBox.y}mm`)
  })

  test('sandboxes every frame and applies the policy for its script mode', () => {
    const refused = printablePages([fluid], grid, { nonce: 'known' })
    const sandboxed = printablePages([Page.parse({ html: '<script>1</script>', scripts: 'sandboxed' })], grid, { nonce: 'known' })
    expect(refused).toContain('sandbox="allow-scripts"')
    expect(refused).not.toContain('allow-same-origin')
    expect(refused).toContain("script-src 'nonce-known'")
    expect(sandboxed).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(sandboxed).toContain("connect-src 'none'")
    expect(refused).not.toContain('var printAt=')
    expect(refused).not.toContain('dispatchPrint()')
  })

  test('adds extra content security policy directives when supplied', () => {
    const html = printablePages([fluid], grid, { nonce: 'known', cspExtra: 'img-src data:' })
    expect(html).toContain('img-src data:')
  })

  test('refuses an empty collection', () => {
    expect(() => printablePages([], grid)).toThrow(new RangeError('There is nothing to print. Pass at least one page to clear this refusal.'))
  })
})
