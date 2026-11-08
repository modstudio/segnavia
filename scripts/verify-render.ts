import './source-guard.ts'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { capture } from '@segnavia/capture'
import { Document, MM_PER_PT, pageFromDocument, printBoxes } from '@segnavia/format'
import { captureImage, openRenderer, RenderRefusedError } from '@segnavia/render'
import { chromiumPath } from './chromium-path.ts'
import { handoutImposition } from './demo-deck-pdf-fixtures.ts'
import { labelsImposition, postcardPage } from './demo-page-fixtures.ts'
import { screenDeck, screenPage } from './screen-document.ts'
import { verifyBackdropRaster } from './verify/backdrop-raster.ts'
import { verifyBookOffline } from './verify/book-offline.ts'
import { verifyBookRender } from './verify/book-render.ts'
import { verifyClippedBleed } from './verify/clipped-bleed.ts'
import { verifyLongDeckNotes } from './verify/deck-notes-render.ts'
import { verifyDeckRender } from './verify/deck-render.ts'
import { verifyDependencyRender } from './verify/dependency-render.ts'
import { verifyDiagramRender } from './verify/diagram-render.ts'
import { verifyFontSource } from './verify/font-source.ts'
import { verifyHebrewFaceGoldens } from './verify/hebrew-face-goldens.ts'
import { verifyHebrewNotice } from './verify/hebrew-notice.ts'
import { imageSize } from './verify/image-size.ts'
import { verifyLocalFont } from './verify/local-font.ts'
import { verifyNamedPaperRender } from './verify/named-paper-render.ts'
import { verifyPageOverflow } from './verify/page-overflow.ts'
import { verifyPagesRender } from './verify/pages-render.ts'
import { darkestNear, rasterValue, readPgm } from './verify/pgm.ts'
import { verifyPressRender } from './verify/press-render.ts'
import { verifyRenderContainment } from './verify/render-containment.ts'
import { verifyScriptFaces } from './verify/script-faces.ts'

const CHROMIUM = chromiumPath()
const jsHeapMb = 128
const FACE = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
const runtime = 'Bun' in globalThis ? 'bun' : `node ${process.version}`
let failures = 0
function check(what: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${runtime}] ${what}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const refusal = (work: Promise<unknown>) =>
  work.then(
    () => 'rendered',
    (error: unknown) => (error instanceof RenderRefusedError ? `refused: ${error.message}` : `other: ${String(error)}`),
  )
// With no output root, pdftoppm writes the single page to stdout; an empty
// image would make the comparison pass without comparing anything.
const collectionPdf = execFileSync('pdftoppm', ['-singlefile', '-gray', '-r', '96', path.resolve(import.meta.dirname, '../out/font-collection.pdf')])
const standalonePdf = execFileSync('pdftoppm', ['-singlefile', '-gray', '-r', '96', path.resolve(import.meta.dirname, '../out/font-standalone.pdf')])
check(
  'a collection face has the same PDF glyph ink as its standalone face',
  collectionPdf.length > 0 && collectionPdf.equals(standalonePdf),
  `${collectionPdf.length} and ${standalonePdf.length} bytes`,
)
// A server the renders try to reach, counting every request that arrives.
let hits = 0
const server = createServer((request, response) => {
  hits++
  if (request.url === '/') {
    response.setHeader('content-type', 'text/html')
    response.end('<!doctype html><title>t</title><button id="go">Go</button><p id="out"></p><script>go.onclick = () => (out.textContent = "clicked")</script>')
  } else response.end('x')
})
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
const output = path.resolve(import.meta.dirname, '../out')
const renderer = await openRenderer({ executablePath: CHROMIUM, concurrency: 2, jsHeapMb })
const work = mkdtempSync(path.join(tmpdir(), 'segnavia-render-'))
try {
  await verifyDependencyRender(renderer, work, refusal, check)
  await verifyDiagramRender(renderer, work, check)
  const ready = await refusal(
    renderer.pagePdf(
      screenPage(
        { html: '<p id="p">waiting</p><script>setTimeout(() => { p.textContent = "ready"; pageReady() }, 300)</script>' },
        { settings: { scripts: 'sandboxed' }, size: { width: 400, height: 200 } },
      ),
    ),
  )
  check('a page running code prints once it calls pageReady', ready === 'rendered', ready)
  const silent = await refusal(
    renderer.pagePdf(screenPage({ html: '<p>never ready</p><script>1</script>' }, { settings: { scripts: 'sandboxed' }, size: { width: 400, height: 200 } })),
  )
  check('a page running code that never calls pageReady is refused', silent.startsWith('refused: The page did not call window.pageReady()'), silent)
  const big = await refusal(renderer.pagePdf(screenPage({ html: `<p>${'words '.repeat(4000)}</p>` }), { limits: { bytes: 2000 } }))
  check('a PDF over the byte ceiling is refused, naming both sizes', big.includes('bytes limit of 2000'), big)
  await verifyClippedBleed(renderer, work, CHROMIUM, check)
  await verifyPageOverflow(renderer, work, check, CHROMIUM)
  await verifyNamedPaperRender(renderer, work, check)
  await verifyBackdropRaster(renderer, work, check)
  hits = 0
  const html = `<img src="${origin}/a.png"><link rel="stylesheet" href="${origin}/b.css"><iframe src="${origin}/c"></iframe><script>fetch("${origin}/d"); new Image().src = "${origin}/e"</script>`
  const unapprovedUrl = `${origin}/a.png`
  const checkOfflineRefusal = async (what: string, work: Promise<unknown>, url = unapprovedUrl) => {
    const result = await refusal(work)
    check(what, result.startsWith('refused:') && result.includes(url) && hits === 0, `${result}; requests=${hits}`)
  }
  await checkOfflineRefusal(
    'pagePdf refuses an unapproved asset without reaching the network',
    renderer.pagePdf(screenPage({ html }, { settings: { scripts: 'sandboxed' } }), { waitForPageReady: false }),
  )
  await checkOfflineRefusal('pageImage refuses an unapproved asset without reaching the network', renderer.pageImage(screenPage({ html })))
  await checkOfflineRefusal(
    'imposed pagesPdf refuses an unapproved asset without reaching the network',
    renderer.pagesPdf([screenPage({ html })], { imposition: labelsImposition }),
  )
  await checkOfflineRefusal('bookPdf refuses an unapproved asset without reaching the network', verifyBookOffline(renderer, origin), `${origin}/book.css`)
  const deck = screenDeck([{ type: 'slide', id: 'offline', content: { kind: 'html' as const, html } }], {
    title: 'Offline deck',
    layout: 'fixed' as const,
    fit: 'contain' as const,
    frame: false,
    settings: { scripts: 'sandboxed' as const },
    size: { width: 400, height: 200 },
  })
  const oversizedImposition = {
    paper: { width: 10.001, height: 1, unit: 'mm' as const },
    columns: 10_001,
    rows: 1,
    cell: { width: 0.001, height: 1 },
  }
  const rejectedMessage = (work: Promise<unknown>) =>
    work.then(
      () => 'rendered',
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    )
  const oversizedPages = await rejectedMessage(renderer.pagesPdf([screenPage({ html: '<p>page</p>' })], { imposition: oversizedImposition }))
  check(
    'pagesPdf refuses an imposition of 10001 cells at the edge',
    oversizedPages.includes('10001 cells') && oversizedPages.includes('ceiling is 10000'),
    oversizedPages,
  )
  const oversizedDeck = await rejectedMessage(renderer.deckPdf(deck, { imposition: oversizedImposition }))
  check(
    'deckPdf refuses an imposition of 10001 cells at the edge',
    oversizedDeck.includes('10001 cells') && oversizedDeck.includes('ceiling is 10000'),
    oversizedDeck,
  )
  await checkOfflineRefusal('deckPdf refuses an unapproved asset without reaching the network', renderer.deckPdf(deck))
  await checkOfflineRefusal('notes deckPdf refuses an unapproved asset without reaching the network', renderer.deckPdf(deck, { layout: 'notes' }))
  await checkOfflineRefusal(
    'imposed deckPdf refuses an unapproved asset without reaching the network',
    renderer.deckPdf(deck, { imposition: handoutImposition }),
  )
  const approvedOrigin = origin.replace('http:', 'https:')
  const approvedOffline = await refusal(
    renderer.pagePdf(screenPage({ html: `<img src="${approvedOrigin}/approved.png"><link rel="stylesheet" href="${approvedOrigin}/approved.css">` }), {
      origins: [
        { origin: approvedOrigin, kinds: ['image'] },
        { origin: approvedOrigin, kinds: ['style'] },
      ],
    }),
  )
  check(
    'an approved request unanswered by assets refuses without reaching the network',
    approvedOffline.startsWith('refused:') && approvedOffline.includes(`${approvedOrigin}/approved.png`) && approvedOffline.includes('did not answer') && hits === 0,
    `${approvedOffline}; requests=${hits}`,
  )
  check(
    'refused offline renders reach no server, including book chapter and note resources and top-level deck slides in slides, notes and handout layouts',
    hits === 0,
    `requests=${hits}`,
  )
  if (existsSync(FACE)) {
    const pdf = await renderer.pagePdf(screenPage({ html: '<p style="font-family:SegnaviaFace">Embedded</p>' }, { size: { width: 400, height: 200 } }), {
      fonts: [{ family: 'SegnaviaFace', data: readFileSync(FACE), format: 'truetype', weight: 700 }],
      css: 'p{color:rgb(10, 20, 30);font-size:40px}',
    })
    const file = path.join(work, 'face.pdf')
    writeFileSync(file, pdf)
    const fonts = execFileSync('pdffonts', [file], { encoding: 'utf8' })
    check('a face passed as bytes is embedded in the PDF', fonts.includes('DejaVuSerif-Bold'), fonts.split('\n').slice(2).join(' ').trim())
  }
  await verifyFontSource(renderer, work, check)
  await verifyLocalFont(renderer, work, check)
  await verifyScriptFaces(renderer, work, check)
  await verifyHebrewNotice(renderer, work, check)
  await verifyHebrewFaceGoldens(renderer, work, check)
  let background = ''
  await renderer.pageImage(screenPage({ html: '<h1>House</h1>' }, { size: { width: 200, height: 100 } }), {
    css: 'body{margin:0;background:rgb(0, 128, 0)}',
    beforeOutput: async (tab) => {
      background = await tab.evaluate(() => getComputedStyle(document.body).backgroundColor)
    },
  })
  check("the host's house style reaches the render", background === 'rgb(0, 128, 0)', background)
  let fullPageWebp: Uint8Array<ArrayBufferLike> = new Uint8Array()
  await renderer.pageImage(
    screenPage({ html: '<style>html,body{margin:0}</style><div style="height:300px;background:green"></div>' }, { size: { width: 200, height: 100 } }),
    {
      scale: 2,
      beforeOutput: async (tab) => {
        fullPageWebp = await captureImage(tab, { format: 'webp' }, true)
      },
    },
  )
  const fullPageSize = imageSize(fullPageWebp)
  check('a full-page WebP pixel size reflects the chosen scale', fullPageSize?.width === 400 && fullPageSize.height === 600, JSON.stringify(fullPageSize))
  // A right to left deck's notes: the scaled slide must stay inside its box.
  let overflow = Number.NaN
  await renderer.deckPdf(
    screenDeck([{ type: 'slide', id: 'a', content: { kind: 'html', html: '<h1>שלום</h1>' }, notes: 'הערה' }], {
      title: 'כותרת',
      layout: 'fixed',
      fit: 'contain',
      frame: false,
      settings: { lang: 'he', scripts: 'refuse' },
      size: { width: 1280, height: 720 },
    }),
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        overflow = await tab.evaluate(() => {
          const box = (document.querySelector('.slide') as HTMLElement).getBoundingClientRect()
          const inner = (document.querySelector('.slide > div') as HTMLElement).getBoundingClientRect()
          return Math.max(box.left - inner.left, inner.right - box.right)
        })
      },
    },
  )
  check("a right-to-left deck's notes keep the whole slide inside its thumbnail", overflow <= 1, `overflow=${overflow}px`)

  // Concurrency: four renders at once on a renderer that allows two.
  let running = 0
  let peak = 0
  const slow = screenPage({ html: '<p>slow</p>' }, { size: { width: 200, height: 100 } })
  await Promise.all(
    [1, 2, 3, 4].map(() =>
      renderer.pagePdf(slow, {
        beforeOutput: async () => {
          running++
          peak = Math.max(peak, running)
          await new Promise((resolve) => setTimeout(resolve, 300))
          running--
        },
      }),
    ),
  )
  check('renders beyond the concurrency limit wait their turn', peak === 2, `peak=${peak}`)

  const own = await renderer.pagePdf(
    screenPage({ html: '<style>@page{size:100mm 100mm;margin:0}</style><p>own size</p>' }, { print: { paper: 'letter', orientation: 'portrait' } }),
    { preferCssPageSize: true },
  )
  const ownFile = path.join(work, 'own.pdf')
  writeFileSync(ownFile, own)
  const size = execFileSync('pdfinfo', [ownFile], { encoding: 'utf8' }).match(/Page size:\s+([\d.]+) x ([\d.]+)/)
  check(
    "with preferCssPageSize, the page's own @page size wins over its paper",
    Math.round(Number(size?.[1])) === 283 && Math.round(Number(size?.[2])) === 283,
    size?.[0],
  )

  const postcardFile = path.join(output, 'page-postcard.pdf')
  const postcardInfo = execFileSync('pdfinfo', ['-box', postcardFile], { encoding: 'utf8' })
  const postcard = pageFromDocument(Document.parse(postcardPage))
  if (!postcard.print) throw new Error('The postcard fixture has no print setting.')
  const boxes = printBoxes(postcard.print)
  const expectedBox = (box: { x: number; y: number; width: number; height: number }) =>
    [box.x, boxes.media.height - box.y - box.height, box.x + box.width, boxes.media.height - box.y].map((mm) => mm / MM_PER_PT)
  const actualBox = (name: string) =>
    postcardInfo
      .match(new RegExp(`${name}:\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)`))
      ?.slice(1)
      .map(Number)
  const closeBox = (actual: number[] | undefined, expected: number[]) =>
    actual?.every((value, index) => Math.abs(value - (expected[index] ?? Number.NaN)) <= 0.5) ?? false
  check(
    'a postcard PDF has the media, bleed and trim boxes from its print setting',
    /Pages:\s+1\b/.test(postcardInfo) &&
      closeBox(actualBox('MediaBox'), [0, 0, boxes.media.width / MM_PER_PT, boxes.media.height / MM_PER_PT]) &&
      closeBox(actualBox('BleedBox'), expectedBox(boxes.bleedBox)) &&
      closeBox(actualBox('TrimBox'), expectedBox(boxes.trim)),
    postcardInfo
      .split('\n')
      .filter((line) => /^(Pages|MediaBox|BleedBox|TrimBox):/.test(line))
      .join(', '),
  )

  const postcardRaster = path.join(work, 'postcard')
  execFileSync('pdftoppm', ['-r', '72', '-gray', '-singlefile', postcardFile, postcardRaster])
  const raster = readPgm(`${postcardRaster}.pgm`)
  const marks = boxes.marks.map((mark) => {
    const dx = mark.x2 - mark.x1
    const dy = mark.y2 - mark.y1
    const length = Math.hypot(dx, dy)
    const ux = dx / length
    const uy = dy / length
    return {
      midpoint: darkestNear(raster, (mark.x1 + mark.x2) / 2, (mark.y1 + mark.y2) / 2) < 220,
      before: rasterValue(raster, mark.x1 - ux * 0.5, mark.y1 - uy * 0.5) > 245,
      after: rasterValue(raster, mark.x2 + ux * 0.5, mark.y2 + uy * 0.5) > 245,
    }
  })
  const darkMidpoints = marks.filter((mark) => mark.midpoint).length
  const lightEnds = marks.reduce((count, mark) => count + Number(mark.before) + Number(mark.after), 0)
  const bleedBackground = rasterValue(raster, boxes.bleedBox.x + (boxes.trim.x - boxes.bleedBox.x) / 2, boxes.bleedBox.y + boxes.bleedBox.height / 2)
  const mediaBackground = rasterValue(raster, boxes.bleedBox.x / 2, boxes.bleedBox.y + boxes.bleedBox.height / 2)
  check(
    'a postcard PDF draws every crop mark at its print position and paints only through the bleed',
    darkMidpoints === 8 && lightEnds === 16 && bleedBackground < 245 && mediaBackground > 245,
    `marks=${darkMidpoints}/8, light endpoints=${lightEnds}/16, bleed gray=${bleedBackground}, media gray=${mediaBackground}`,
  )
  verifyPagesRender(output, work, check)
  verifyDeckRender(output, work, check)
  await verifyPressRender(renderer, work, check)
  await verifyBookRender(renderer, work, check)

  let imageProperties = ''
  await renderer.pageImage(postcardPage, {
    beforeOutput: async (tab) => {
      imageProperties = await tab.evaluate(() => {
        const root = getComputedStyle(document.documentElement)
        return `${root.getPropertyValue('--segnavia-bleed')} ${root.getPropertyValue('--segnavia-safe')}`
      })
    },
  })
  check('a page image exposes its print bleed and safe area', imageProperties === '3mm 5mm', imageProperties)

  const tooTall = await refusal(
    renderer.pagePdf(
      screenPage(
        { html: '<div style="height:400mm">Too tall for one printed piece.</div>' },
        {
          print: { paper: { width: 148, height: 105, unit: 'mm' }, orientation: 'landscape', bleed: 3 },
        },
      ),
    ),
  )
  check(
    'a page with bleed whose content needs another paper is refused',
    /^refused: A page with bleed or marks is one printed piece, but the content needs \d+ papers\./.test(tooTall),
    tooTall,
  )
  const slide = await renderer.slideImage(
    screenDeck([{ type: 'slide', id: 'a', content: { kind: 'html', html: '<h1>x</h1>' } }], {
      title: 'T',
      layout: 'fixed',
      fit: 'contain',
      frame: false,
      size: { width: 1280, height: 720 },
      settings: { scripts: 'refuse' },
    }),
    0,
    { scale: 1 },
  )
  const slideFile = path.join(work, 'slide.png')
  writeFileSync(slideFile, slide)
  check('a slide exports as an image at its canvas size', execFileSync('file', [slideFile], { encoding: 'utf8' }).includes('1280 x 720'))

  const fixedImage = execFileSync('file', [path.join(output, 'page-fixed.jpeg')], { encoding: 'utf8' })
  check('pageImage returns the page size in the requested format', fixedImage.includes('JPEG image data') && fixedImage.includes('420x240'), fixedImage.trim())

  const marginXml = execFileSync('pdftotext', ['-bbox', path.join(output, 'page-letter.pdf'), '-'], { encoding: 'utf8' })
  const marker = marginXml.match(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>MARGIN_MARKER<\/word>/)
  check(
    'a PDF on named paper has its requested margins in the rendered content',
    Number(marker?.[1]) >= 42 && Number(marker?.[2]) >= 42,
    marker?.[0] ?? 'marker not found',
  )

  const deckInfo = execFileSync('pdfinfo', [path.join(output, 'deck.pdf')], { encoding: 'utf8' })
  const notesText = execFileSync('pdftotext', [path.join(output, 'deck-notes.pdf'), '-'], { encoding: 'utf8' })
  check(
    "a deck PDF has one sheet per slide and notes layout prefers every slide's speaker notes",
    /Pages:\s+4\b/.test(deckInfo) &&
      ['Static title slide.', 'The class list is where every class starts.', 'Complete the class form.', 'Review the finished class list.'].every((text) =>
        notesText.includes(text),
      ),
  )
  const limits = readFileSync(path.join(output, 'limits.txt'), 'utf8')
  check('the sheets ceiling refuses the deck and names both counts', limits.includes('4 sheets') && limits.includes('sheets limit of 2'), limits)
  let notesDirection = ''
  await renderer.deckPdf(
    screenDeck([{ type: 'slide', id: 'a', content: { kind: 'html', html: '<p>English slide</p>' }, notes: 'הערה בעברית' }], {
      title: 'English deck',
      layout: 'fixed',
      fit: 'contain',
      frame: false,
      size: { width: 400, height: 200 },
      settings: { scripts: 'refuse' },
    }),
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        notesDirection = await tab.locator('.notes').evaluate((notes) => getComputedStyle(notes).direction)
      },
    },
  )
  check('a right-to-left note under a left-to-right deck takes its own direction', notesDirection === 'rtl', notesDirection)
  await verifyLongDeckNotes(renderer, work, check)

  const shots = path.join(work, 'shots')
  const run = await capture(
    { open: async () => ({}) },
    [
      {
        name: 'button',
        async run(flow) {
          await flow.step('open', () => flow.goto('/'))
          await flow.step('press', () => flow.page.click('#go'))
          await flow.until(() => document.getElementById('out')?.textContent === 'clicked', 'the click to land')
          await flow.shot({ key: 'node.button', title: 'Pressed', annotate: [{ target: { role: 'button', name: 'Go' }, number: 1 }] })
        },
      },
    ],
    { baseUrl: origin, outputDirectory: shots, executablePath: CHROMIUM, output: { format: 'webp', annotated: true } },
  )
  check(
    'capture runs a flow and writes clean and annotated images',
    run.ok && existsSync(path.join(shots, 'node.button.webp')) && existsSync(path.join(shots, 'node.button.annotated.webp')),
    run.results[0]?.error,
  )
  await verifyRenderContainment(renderer, check, jsHeapMb)
} finally {
  await renderer.close()
  server.close()
  rmSync(work, { recursive: true, force: true })
}
console.log(failures === 0 ? `all render checks passed under ${runtime}` : `${failures} render checks failed under ${runtime}`)
process.exit(failures === 0 ? 0 : 1)
