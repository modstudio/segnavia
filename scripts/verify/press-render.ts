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
import { pressColor } from '../../packages/render/src/press/color-policy.ts'
import { visitContentOperators } from '../../packages/render/src/press/content.ts'
import { arrayNumbers, decodeContent, nameOf, numberOf, rawStreamOf } from '../../packages/render/src/press/pdf-objects.ts'
import { walkPressGraph } from '../../packages/render/src/press/visitor.ts'
import { verifyGrayPress } from './gray-press.ts'

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

const gradientHtml = `<body style="margin:20px;display:grid;grid-template-columns:repeat(2,260px);gap:16px">
<div style="height:160px;background:conic-gradient(red,yellow,lime,aqua,blue,magenta,red)"></div>
<div style="height:160px;background:repeating-linear-gradient(45deg,#e03030 0 10px,#3030e0 10px 20px)"></div>
<div style="height:160px;background:repeating-radial-gradient(circle,#20a060 0 8px,#f0c020 8px 16px)"></div>
<div style="height:160px;background:conic-gradient(from 90deg,#333,#fff)"></div></body>`

interface Region {
  name: string
  x0: number
  x1: number
  y0: number
  y1: number
}

function proofRgb(press: ReturnType<typeof readProfile>, pixel: [number, number, number]): [number, number, number] {
  return proof(press, [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255]).map((value) => Math.round(value * 255)) as [number, number, number]
}

function conicAngleDelta(original: Ppm, converted: Ppm, cx: number, cy: number, radius: number, press: ReturnType<typeof readProfile>): number {
  let max = 0
  for (let step = 0; step < 8; step++) {
    const angle = (step * Math.PI) / 4
    const x = cx + radius * Math.sin(angle)
    const y = cy - radius * Math.cos(angle)
    max = Math.max(max, channelDistance(pixelRgb(converted, x, y), proofRgb(press, pixelRgb(original, x, y))))
  }
  return max
}

function regionProofStats(original: Ppm, converted: Ppm, region: Region, press: ReturnType<typeof readProfile>): { max: number; mean: number } {
  let difference = 0
  let max = 0
  let count = 0
  const x0 = Math.max(0, Math.floor(region.x0))
  const y0 = Math.max(0, Math.floor(region.y0))
  const x1 = Math.min(original.width, Math.ceil(region.x1))
  const y1 = Math.min(original.height, Math.ceil(region.y1))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * original.width + x) * 3
      const expected = proofRgb(press, [original.pixels[offset] ?? 0, original.pixels[offset + 1] ?? 0, original.pixels[offset + 2] ?? 0])
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs((converted.pixels[offset + channel] ?? 0) - (expected[channel] ?? 0))
        difference += delta
        max = Math.max(max, delta)
        count++
      }
    }
  }
  return { mean: count === 0 ? Number.POSITIVE_INFINITY : difference / count, max }
}

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

async function cmykColors(bytes: Uint8Array): Promise<number[][]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const colors: number[][] = []
  walkPressGraph(document, {
    content: (_object, stream) => {
      visitContentOperators(decodeContent(stream), (operator, operands) => {
        if ((operator === 'k' || operator === 'K') && operands.length === 4) colors.push(operands)
      })
    },
    function: (fn) => {
      if (fn && numberOf(fn, 'FunctionType') === 2) {
        for (const name of ['C0', 'C1']) if (fn.has(PDFName.of(name))) colors.push(arrayNumbers(fn, name, 4))
      }
    },
    group: () => undefined,
    image: (stream) => {
      if (stream.dict.has(PDFName.of('SegnaviaEffectColor'))) colors.push(arrayNumbers(stream.dict, 'SegnaviaEffectColor', 4))
    },
    shading: () => true,
  })
  return colors
}

const sameColor = (left: number[], right: number[]): boolean => left.every((value, index) => Math.abs(value - (right[index] ?? Number.NaN)) <= 0.002)

async function verifyNeutralTolerance(renderer: Renderer, check: Check, profileBytes: Uint8Array): Promise<void> {
  const rgb8 = [
    [103, 101, 100],
    [62, 61, 60],
    [182, 181, 180],
  ] as const
  const page = {
    html: `<style>@page{size:400px 220px;margin:0}body{margin:40px}.shadow{width:120px;height:60px;background:white;box-shadow:12px 12px 8px rgb(103,101,100)}.gradient{margin-top:40px;width:240px;height:60px;background:linear-gradient(90deg,rgb(62,61,60),rgb(182,181,180))}</style><div class="shadow"></div><div class="gradient"></div>`,
    size: { width: 400, height: 220 },
  }
  let defaultReport: PressReport | undefined
  let exactReport: PressReport | undefined
  const defaults = await renderer.pagePdf(
    page,
    reportOption(profileBytes, (report) => (defaultReport = report)),
  )
  const exact = await renderer.pagePdf(page, { press: { profile: profileBytes, neutralTolerance: 0, report: (report) => (exactReport = report) } })
  const profile = readProfile(profileBytes)
  const defaultColors = await cmykColors(defaults)
  const exactColors = await cmykColors(exact)
  const rgb = rgb8.map((color) => color.map((channel) => channel / 255) as [number, number, number])
  const defaultExpected = rgb.map((color) => pressColor(profile, color, 3))
  const exactExpected = rgb.map((color) => pressColor(profile, color, 0))
  check(
    'the default press neutral tolerance paints a near-grey shadow and gradient with black ink alone',
    defaultExpected.every((color) => color.slice(0, 3).every((channel) => channel === 0) && defaultColors.some((found) => sameColor(found, color))) &&
      (defaultReport?.neutralColors ?? 0) > 0,
    defaultReport ? JSON.stringify({ report: defaultReport, colors: defaultColors, expected: defaultExpected }) : 'report not called',
  )
  check(
    'press neutral tolerance zero paints the near-grey shadow and gradient with all four inks',
    exactExpected.every((color) => color.every((channel) => channel > 0) && exactColors.some((found) => sameColor(found, color))) &&
      exactReport?.neutralColors === 0,
    exactReport ? JSON.stringify(exactReport) : 'report not called',
  )
}

async function verifyPressGradients(renderer: Renderer, work: string, check: Check, profile: Uint8Array): Promise<void> {
  const gradientPage = { html: gradientHtml, scripts: 'refuse' as const, size: { width: 600, height: 400 } }
  let gradientReport: PressReport | undefined
  const unconvertedGradients = await renderer.pagePdf(gradientPage)
  const convertedGradients = await renderer.pagePdf(
    gradientPage,
    reportOption(profile, (report) => (gradientReport = report)),
  )
  const runtime = 'Bun' in globalThis ? 'bun' : `node ${process.version}`
  console.log(`PRESS GRADIENTS [${runtime}]: converted bytes=${convertedGradients.length}`)
  check(
    'press rewrite samples conic and repeating gradients and leaves no RGB outside images',
    gradientReport !== undefined && gradientReport.images.length === 0 && gradientReport.sampledShadings === 4,
    gradientReport ? JSON.stringify(gradientReport) : 'report not called',
  )
  const originalGradients = raster(work, 'press-gradients-original', unconvertedGradients)
  const convertedGradientRaster = raster(work, 'press-gradients-converted', convertedGradients)
  const cssPt = 0.75
  const box = { width: 260 * cssPt, height: 160 * cssPt, gap: 16 * cssPt, margin: 20 * cssPt }
  const regions: Region[] = [
    { name: 'rainbow conic', x0: box.margin, y0: box.margin, x1: box.margin + box.width, y1: box.margin + box.height },
    { name: 'repeating linear', x0: box.margin + box.width + box.gap, y0: box.margin, x1: box.margin + 2 * box.width + box.gap, y1: box.margin + box.height },
    { name: 'repeating radial', x0: box.margin, y0: box.margin + box.height + box.gap, x1: box.margin + box.width, y1: box.margin + 2 * box.height + box.gap },
    {
      name: 'gray conic',
      x0: box.margin + box.width + box.gap,
      y0: box.margin + box.height + box.gap,
      x1: box.margin + 2 * box.width + box.gap,
      y1: box.margin + 2 * box.height + box.gap,
    },
  ]
  const press = readProfile(profile)
  // Proof-mean on Generic CMYK is 12.7–15.7; a 90-degree rotation of the same box is 53–83. Bound 22 fails a rotated or missing quadrant.
  const regionMeanBound = 22
  for (const region of regions) {
    const stats = regionProofStats(originalGradients, convertedGradientRaster, region, press)
    check(
      `sampled ${region.name} stays close to the proof of the unconverted raster`,
      originalGradients.width === convertedGradientRaster.width && stats.mean < regionMeanBound,
      `mean=${stats.mean.toFixed(2)} max=${stats.max} (mean bound ${regionMeanBound})`,
    )
  }
  const rainbow = regions[0]
  const cx = ((rainbow?.x0 ?? 0) + (rainbow?.x1 ?? 0)) / 2
  const cy = ((rainbow?.y0 ?? 0) + (rainbow?.y1 ?? 0)) / 2
  const angleMax = conicAngleDelta(originalGradients, convertedGradientRaster, cx, cy, 40, press)
  // Measured 30 at 45deg; a rotated wheel puts a primary on the wrong sample and exceeds 150.
  const angleBound = 40
  check(
    'converted rainbow conic matches the proof of the unconverted raster at eight angles around the center',
    angleMax <= angleBound,
    `max channel delta=${angleMax} (bound ${angleBound})`,
  )
  const red = proof(press, [1, 0, 0]).map((value) => Math.round(value * 255)) as [number, number, number]
  const stripe = proof(press, [224 / 255, 48 / 255, 48 / 255]).map((value) => Math.round(value * 255)) as [number, number, number]
  const conicPixel = pixelRgb(convertedGradientRaster, cx, (rainbow?.y0 ?? 0) + 20)
  const linear = regions[1]
  const stripePixel = pixelRgb(convertedGradientRaster, ((linear?.x0 ?? 0) + (linear?.x1 ?? 0)) / 2, ((linear?.y0 ?? 0) + (linear?.y1 ?? 0)) / 2)
  const conicDelta = channelDistance(conicPixel, red)
  const stripeDelta = channelDistance(stripePixel, stripe)
  check(
    'a conic stop and a repeating stripe match their proof colors',
    conicDelta <= 24 && stripeDelta <= 24,
    `conic=${conicPixel.join(',')} delta=${conicDelta}, stripe=${stripePixel.join(',')} delta=${stripeDelta} (bound 24)`,
  )
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

  const deck: Deck = {
    title: 'Press',
    fit: 'contain',
    size: { width: 1200, height: 800 },
    scripts: 'sandboxed',
    slides: [{ id: 'press', content: { kind: 'html', html } }],
  }
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
    fit: 'contain',
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

  await verifyPressGradients(renderer, work, check, profile)
  await verifyNeutralTolerance(renderer, check, profile)
  await verifyGrayPress(renderer, check)
}
