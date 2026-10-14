import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Deck } from '@segnavia/format'
import type { PressReport, Renderer } from '@segnavia/render'
import { proof } from '../../packages/render/src/color/engine.ts'
import { readProfile } from '../../packages/render/src/color/profile.ts'
import { buildPressProfile } from '../../packages/render/src/color/profile-fixture.test-helper.ts'
import { rewritePressPdf } from '../../packages/render/src/press/adapter.ts'
import { visitContentOperators } from '../../packages/render/src/press/content.ts'
import { decodeContent, nameOf, numberOf, rawStreamOf } from '../../packages/render/src/press/pdf-objects.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const genericProfile = '/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc'
const renderRequire = createRequire(new URL('../../packages/render/package.json', import.meta.url))
const { PDFArray, PDFDocument, PDFName } = renderRequire('pdf-lib')

const html = `<!doctype html><style>
@page{size:1200px 800px;margin:0}*{box-sizing:border-box}html,body{margin:0;width:1200px;height:800px}
body{padding:34px;font:18px Arial,sans-serif;color:#000;background:#fff}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:15px}
.tile{min-height:105px;padding:12px;border:5px solid #0080ff}.gray{color:#333}.color{color:#e02070}.solid{background:#f4b942}
.two{background:linear-gradient(90deg,#f00,#00f)}.three{background:linear-gradient(90deg,#0f0 0%,#f0f 45%,#0ff 100%)}
.radial{background:radial-gradient(circle,#ff0 0%,#ff8000 55%,#202080 100%)}.shadow{background:#eee;box-shadow:8px 8px 12px rgba(20,100,220,.7)}
.textshadow{color:#804000;text-shadow:4px 4px 4px rgba(0,180,40,.75)}.under{background:#0060d0;padding:10px}.opacity{opacity:.5;background:#ff2000;padding:18px}
svg{width:100%;height:78px}img{width:96px;height:64px;object-fit:cover;margin-right:8px}
</style><h1>Press color probe: <span class="gray">#333 gray</span> <span class="color">colored text</span></h1><div class="grid">
<div class="tile solid">Solid fill and blue border</div><div class="tile two">Two-stop linear gradient</div><div class="tile three">Three-stop linear gradient</div>
<div class="tile radial">Radial gradient</div><div class="tile shadow">Blurred box shadow</div><div class="tile textshadow">Blurred text shadow</div>
<div class="tile under"><div class="opacity">50% opacity over blue</div></div><div class="tile"><svg viewBox="0 0 240 80"><rect x="8" y="8" width="88" height="62" fill="#20c080"/><circle cx="165" cy="40" r="30" fill="#f05020" stroke="#7020c0" stroke-width="9"/></svg></div>
<div class="tile"><img id="png"><img id="jpeg"><div>embedded PNG + JPEG</div></div><div class="tile" style="color:#00ff00;font-weight:bold">Saturated green</div><div class="tile">Black text #000</div></div>
<script>function image(type){const c=document.createElement('canvas');c.width=96;c.height=64;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,96,64);g.addColorStop(0,'#ff3040');g.addColorStop(1,'#10d0ff');x.fillStyle=g;x.fillRect(0,0,96,64);x.fillStyle='#00ff00';x.fillRect(34,18,28,28);return c.toDataURL(type,.86)}png.src=image('image/png');jpeg.src=image('image/jpeg');pageReady()</script>`

function reportOption(profile: Uint8Array, receive: (report: PressReport) => void) {
  return { press: { profile, report: receive } }
}

interface Ppm {
  height: number
  pixels: Uint8Array
  width: number
}

function readPpm(file: string): Ppm {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while ((bytes[offset] ?? 0) <= 32) offset++
    const start = offset
    while ((bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P6') throw new Error(`The raster at ${file} is not a raw PPM.`)
  const width = Number(token())
  const height = Number(token())
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit RGB.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return { width, height, pixels: bytes.subarray(offset) }
}

function raster(work: string, name: string, bytes: Uint8Array): Ppm {
  const pdf = path.join(work, `${name}.pdf`)
  const prefix = path.join(work, name)
  writeFileSync(pdf, bytes)
  execFileSync('pdftoppm', ['-r', '72', '-f', '1', '-l', '1', '-singlefile', pdf, prefix])
  return readPpm(`${prefix}.ppm`)
}

function meanDifference(first: Ppm, second: Ppm): number {
  if (first.width !== second.width || first.height !== second.height || first.pixels.length !== second.pixels.length) return Number.POSITIVE_INFINITY
  let difference = 0
  for (let index = 0; index < first.pixels.length; index++) difference += Math.abs((first.pixels[index] ?? 0) - (second.pixels[index] ?? 0))
  return difference / first.pixels.length
}

function pixelRgb(image: Ppm, x: number, y: number): [number, number, number] {
  const px = Math.min(image.width - 1, Math.max(0, Math.round(x)))
  const py = Math.min(image.height - 1, Math.max(0, Math.round(y)))
  const offset = (py * image.width + px) * 3
  return [image.pixels[offset] ?? 0, image.pixels[offset + 1] ?? 0, image.pixels[offset + 2] ?? 0]
}

function channelDistance(found: [number, number, number], expected: [number, number, number]): number {
  return Math.max(...found.map((value, index) => Math.abs(value - (expected[index] ?? 0))))
}

const gradientHtml = `<!doctype html><style>
@page{size:300px 100px;margin:0}
html,body{margin:0;width:300px;height:100px;display:flex}
.box{width:100px;height:100px}
.conic{background:conic-gradient(red, yellow, lime, aqua, blue, magenta, red)}
.linear{background:repeating-linear-gradient(90deg, #e03030 0 40px, #3030e0 40px 80px)}
.radial{background:repeating-radial-gradient(circle at 50% 50%, #e03030 0 40px, #3030e0 40px 80px)}
</style><div class="box conic"></div><div class="box linear"></div><div class="box radial"></div>`

async function pageHasBlackInk(bytes: Uint8Array): Promise<boolean> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  for (const page of document.getPages()) {
    const contents = page.node.Contents()
    const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    for (const object of objects) {
      const stream = rawStreamOf(document.context.lookup(object))
      if (stream) {
        let found = false
        visitContentOperators(decodeContent(stream), (operator, operands) => {
          if (operator === 'k' && operands.length === 4 && operands.every((value, index) => value === [0, 0, 0, 1][index])) found = true
        })
        if (found) return true
      }
    }
  }
  return false
}

async function largestContentStream(bytes: Uint8Array): Promise<number> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  let largest = 0
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    const stream = rawStreamOf(object)
    if (!stream || nameOf(stream.dict.get(PDFName.of('Subtype'))) === 'Image') continue
    const content = nameOf(stream.dict.get(PDFName.of('Subtype'))) === 'Form' || numberOf(stream.dict, 'PatternType') === 1
    if (content) largest = Math.max(largest, decodeContent(stream).byteLength)
  }
  for (const page of document.getPages()) {
    const contents = page.node.Contents()
    const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
    for (const object of objects) {
      const stream = rawStreamOf(document.context.lookup(object))
      if (stream) largest = Math.max(largest, decodeContent(stream).byteLength)
    }
  }
  return largest
}

export async function verifyPressRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const profile = existsSync(genericProfile) ? new Uint8Array(readFileSync(genericProfile)) : buildPressProfile('mft1')
  const profileName = existsSync(genericProfile) ? 'macOS Generic CMYK' : 'synthetic CMYK'
  console.log(`PRESS PROFILE [${'Bun' in globalThis ? 'bun' : `node ${process.version}`}]: ${profileName}`)
  const page = { html, scripts: 'sandboxed' as const, size: { width: 1200, height: 800 } }
  const unconverted = await renderer.pagePdf(page)
  let pageReport: PressReport | undefined
  const converted = await renderer.pagePdf(page, { waitForPageReady: true, ...reportOption(profile, (report) => (pageReport = report)) })
  const started = performance.now()
  await rewritePressPdf(unconverted, profile)
  const elapsed = performance.now() - started
  const report = pageReport
  check(
    'press page reports exactly two RGB images and converted vector color',
    report !== undefined && report.images.length === 2 && report.fills > 0 && report.strokes > 0 && report.gradientStops > 0 && report.groups > 0,
    report ? `${JSON.stringify(report)}, rewrite=${elapsed.toFixed(1)}ms` : 'report not called',
  )
  check('press page writes black text as black ink alone', await pageHasBlackInk(converted))
  console.log(
    `PRESS CONTENT [${'Bun' in globalThis ? 'bun' : `node ${process.version}`}]: demo page largest stream=${await largestContentStream(unconverted)} bytes`,
  )
  const originalRaster = raster(work, 'press-original', unconverted)
  const convertedRaster = raster(work, 'press-converted', converted)
  const difference = meanDifference(originalRaster, convertedRaster)
  check(
    'press rewrite preserves the page size and visible content',
    originalRaster.width === convertedRaster.width && originalRaster.height === convertedRaster.height && difference < 20,
    `${originalRaster.width}x${originalRaster.height}, mean channel difference=${difference.toFixed(2)} (bound 20 from the prototype's measured 4.08 with profile/runtime allowance)`,
  )

  const imposition = {
    paper: { width: 320, height: 240, unit: 'mm' as const },
    orientation: 'landscape' as const,
    columns: 1,
    rows: 1,
    cell: { width: 317.5, height: 211.67 },
  }
  let pagesReport: PressReport | undefined
  await renderer.pagesPdf([page], { imposition, waitForPageReady: true, ...reportOption(profile, (report) => (pagesReport = report)) })
  check('press conversion runs after pagesPdf imposition', pagesReport?.images.length === 2, pagesReport ? JSON.stringify(pagesReport) : 'report not called')

  const deck: Deck = { title: 'Press', size: { width: 1200, height: 800 }, scripts: 'sandboxed', slides: [{ id: 'press', content: { kind: 'html', html } }] }
  let deckReport: PressReport | undefined
  await renderer.deckPdf(
    deck,
    reportOption(profile, (report) => (deckReport = report)),
  )
  check('press conversion runs on deckPdf', deckReport?.images.length === 2, deckReport ? JSON.stringify(deckReport) : 'report not called')

  let emojiReport: PressReport | undefined
  await renderer.pagePdf(
    { html: '<!doctype html><style>@page{size:600px 200px;margin:0}body{font:72px Arial}</style><p>Emoji 😀 🎉 ❤️</p>', size: { width: 600, height: 200 } },
    reportOption(profile, (report) => (emojiReport = report)),
  )
  check(
    'press conversion reports the RGB image drawn by a Type 3 color emoji glyph',
    (emojiReport?.images.length ?? 0) > 0,
    emojiReport ? JSON.stringify(emojiReport) : 'report not called',
  )

  const longDeck: Deck = {
    title: 'Press content bound',
    size: { width: 1200, height: 800 },
    scripts: 'refuse',
    slides: Array.from({ length: 24 }, (_, index) => ({
      id: `press-${index}`,
      content: { kind: 'html', html: `<style>body{font:48px Arial;color:rgb(${index * 9},80,180)}</style><h1>Press page ${index + 1}</h1>` },
    })),
  }
  const longPdf = await renderer.deckPdf(longDeck)
  console.log(
    `PRESS CONTENT [${'Bun' in globalThis ? 'bun' : `node ${process.version}`}]: 24-page deck largest stream=${await largestContentStream(longPdf)} bytes`,
  )

  const gradientPage = { html: gradientHtml, size: { width: 300, height: 100 } }
  let gradientReport: PressReport | undefined
  const unconvertedGradients = await renderer.pagePdf(gradientPage)
  const convertedGradients = await renderer.pagePdf(
    gradientPage,
    reportOption(profile, (report) => (gradientReport = report)),
  )
  check(
    'press rewrite samples conic and repeating gradients and leaves no RGB outside images',
    gradientReport !== undefined && gradientReport.images.length === 0 && gradientReport.sampledShadings === 3,
    gradientReport ? JSON.stringify(gradientReport) : 'report not called',
  )
  const originalGradients = raster(work, 'press-gradients-original', unconvertedGradients)
  const convertedGradientRaster = raster(work, 'press-gradients-converted', convertedGradients)
  const gradientDifference = meanDifference(originalGradients, convertedGradientRaster)
  // Measured 40.07 on an all-gradient page through Generic CMYK; saturated CSS primaries shift more than the mixed demo page (7.20 against bound 20).
  check(
    'sampled gradient rewrite stays close to the RGB page',
    originalGradients.width === convertedGradientRaster.width && originalGradients.height === convertedGradientRaster.height && gradientDifference < 48,
    `${originalGradients.width}x${originalGradients.height}, mean channel difference=${gradientDifference.toFixed(2)} (bound 48)`,
  )
  const press = readProfile(profile)
  const cssPx = originalGradients.width / 300
  const red = proof(press, [1, 0, 0]).map((value) => Math.round(value * 255)) as [number, number, number]
  const stripe = proof(press, [224 / 255, 48 / 255, 48 / 255]).map((value) => Math.round(value * 255)) as [number, number, number]
  const conicPixel = pixelRgb(convertedGradientRaster, 50 * cssPx, 20 * cssPx)
  const stripePixel = pixelRgb(convertedGradientRaster, 120 * cssPx, 50 * cssPx)
  const conicDelta = channelDistance(conicPixel, red)
  const stripeDelta = channelDistance(stripePixel, stripe)
  // Measured 19 and 20 against the library proof; pdftoppm's CMYK preview is not the same engine.
  check(
    'a conic stop and a repeating stripe match their proof colors',
    conicDelta <= 24 && stripeDelta <= 24,
    `conic=${conicPixel.join(',')} delta=${conicDelta}, stripe=${stripePixel.join(',')} delta=${stripeDelta} (bound 24)`,
  )
}
