// Rendering and capture checks that need no viewer: the ready handshake,
// limits, the offline rule under attack, embedded faces, house style, and a
// capture run. The demo runs this file under both Bun and Node to prove both
// runtimes against the repository source.

import './source-guard.ts'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { capture } from '@segnavia/capture'
import { captureImage, openRenderer, RenderRefusedError } from '@segnavia/render'
import { imageSize } from './verify/image-size.ts'

const CHROMIUM = process.env.SEGNAVIA_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
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

const renderer = await openRenderer({ executablePath: CHROMIUM, concurrency: 2, jsHeapMb: 128 })
const work = mkdtempSync(path.join(tmpdir(), 'segnavia-render-'))
try {
  const ready = await refusal(
    renderer.pagePdf({
      html: '<p id="p">waiting</p><script>setTimeout(() => { p.textContent = "ready"; pageReady() }, 300)</script>',
      scripts: 'sandboxed',
      size: { width: 400, height: 200 },
    }),
  )
  check('a page running code prints once it calls pageReady', ready === 'rendered', ready)
  const silent = await refusal(renderer.pagePdf({ html: '<p>never ready</p><script>1</script>', scripts: 'sandboxed', size: { width: 400, height: 200 } }))
  check('a page running code that never calls pageReady is refused', silent.startsWith('refused: The page did not call window.pageReady()'), silent)
  const big = await refusal(renderer.pagePdf({ html: `<p>${'words '.repeat(4000)}</p>` }, { limits: { maxBytes: 2000 } }))
  check('a PDF over the byte ceiling is refused, naming both sizes', /^refused: The PDF is \d+ bytes; the limit is 2000\.$/.test(big), big)

  hits = 0
  const html = `<img src="${origin}/a.png"><link rel="stylesheet" href="${origin}/b.css"><iframe src="${origin}/c"></iframe><script>fetch("${origin}/d"); new Image().src = "${origin}/e"</script>`
  await renderer.pagePdf({ html, scripts: 'sandboxed' }, { waitForPageReady: false })
  await renderer.pageImage({ html })
  check('a render reaches no server, whatever the page asks for', hits === 0, `requests=${hits}`)

  if (existsSync(FACE)) {
    const pdf = await renderer.pagePdf(
      { html: '<p style="font-family:SegnaviaFace">Embedded</p>', size: { width: 400, height: 200 } },
      { fonts: [{ family: 'SegnaviaFace', data: readFileSync(FACE), format: 'truetype', weight: 700 }], css: 'p{color:rgb(10, 20, 30);font-size:40px}' },
    )
    const file = path.join(work, 'face.pdf')
    writeFileSync(file, pdf)
    const fonts = execFileSync('pdffonts', [file], { encoding: 'utf8' })
    check('a face passed as bytes is embedded in the PDF', fonts.includes('DejaVuSerif-Bold'), fonts.split('\n').slice(2).join(' ').trim())
  }

  let background = ''
  await renderer.pageImage(
    { html: '<h1>House</h1>', size: { width: 200, height: 100 } },
    {
      css: 'body{margin:0;background:rgb(0, 128, 0)}',
      beforeOutput: async (tab) => {
        background = await tab.evaluate(() => getComputedStyle(document.body).backgroundColor)
      },
    },
  )
  check("the host's house style reaches the render", background === 'rgb(0, 128, 0)', background)

  let fullPageWebp: Uint8Array<ArrayBufferLike> = new Uint8Array()
  await renderer.pageImage(
    { html: '<style>html,body{margin:0}</style><div style="height:300px;background:green"></div>', size: { width: 200, height: 100 } },
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
    {
      title: 'כותרת',
      lang: 'he',
      size: { width: 1280, height: 720 },
      scripts: 'refuse',
      slides: [{ id: 'a', content: { kind: 'html', html: '<h1>שלום</h1>' }, notes: 'הערה' }],
    },
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        overflow = await tab.evaluate(() => {
          const box = (document.querySelector('.slide') as HTMLElement).getBoundingClientRect()
          const inner = (document.querySelector('.slide iframe') as HTMLElement).getBoundingClientRect()
          return Math.max(box.left - inner.left, inner.right - box.right)
        })
      },
    },
  )
  check("a right-to-left deck's notes keep the whole slide inside its thumbnail", overflow <= 1, `overflow=${overflow}px`)

  // Concurrency: four renders at once on a renderer that allows two.
  let running = 0
  let peak = 0
  const slow = { html: '<p>slow</p>', size: { width: 200, height: 100 } } as const
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
    { html: '<style>@page{size:100mm 100mm;margin:0}</style><p>own size</p>', print: { paper: 'letter', orientation: 'portrait' } },
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

  const slide = await renderer.slideImage(
    { title: 'T', size: { width: 1280, height: 720 }, scripts: 'refuse', slides: [{ id: 'a', content: { kind: 'html', html: '<h1>x</h1>' } }] },
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
    "a deck PDF has one sheet per slide and notes layout prints every slide's notes",
    /Pages:\s+4\b/.test(deckInfo) &&
      ['Static title slide.', 'Everything starts on your class list.', 'Give the class a name', 'Review the finished class list.'].every((text) =>
        notesText.includes(text),
      ),
  )
  const limits = readFileSync(path.join(output, 'limits.txt'), 'utf8')
  check('the maxSheets ceiling refuses the deck and names both counts', limits === 'The PDF has 4 sheets; the limit is 2.', limits)
  let notesDirection = ''
  await renderer.deckPdf(
    {
      title: 'English deck',
      size: { width: 400, height: 200 },
      scripts: 'refuse',
      slides: [{ id: 'a', content: { kind: 'html', html: '<p>English slide</p>' }, notes: 'הערה בעברית' }],
    },
    {
      layout: 'notes',
      beforeOutput: async (tab) => {
        notesDirection = await tab.locator('.notes').evaluate((notes) => getComputedStyle(notes).direction)
      },
    },
  )
  check('a right-to-left note under a left-to-right deck takes its own direction', notesDirection === 'rtl', notesDirection)

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
} finally {
  await renderer.close()
  server.close()
  rmSync(work, { recursive: true, force: true })
}
console.log(failures === 0 ? `all render checks passed under ${runtime}` : `${failures} render checks failed under ${runtime}`)
process.exit(failures === 0 ? 0 : 1)
