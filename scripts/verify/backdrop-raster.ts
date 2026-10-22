import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { PDFDict, PDFName, PDFRawStream } from 'pdf-lib'
import { loadPdf } from '../../packages/render/src/pdf-load.ts'
import { pngPixels } from './browser-pixels.ts'
import { readPpm } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const SCALE = 150 / 96
const WIDTH = 480
const HEIGHT = 320
const PANEL = { x: 70, y: 55, width: 340, height: 210 }
const html = `<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{background:repeating-linear-gradient(90deg,#274060 0 12px,#a85f7e 12px 24px)}
.glass{position:absolute;left:${PANEL.x}px;top:${PANEL.y}px;width:${PANEL.width}px;height:${PANEL.height}px;padding:38px;border:3px solid #fff8;border-radius:34px;background:#ffffff24;backdrop-filter:blur(18px);color:white;font:700 16px/1.2 sans-serif}
.glass a{color:white}
.mix{position:absolute;left:4px;top:4px;width:12px;height:12px;background:#00ff00;mix-blend-mode:screen}
</style><div class="mix"></div><section class="glass">FROSTED <a href="https://example.invalid/">selectable</a></section>`

function rgbOf(rgba: number[]): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3)
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    rgb[target] = rgba[source] ?? 0
    rgb[target + 1] = rgba[source + 1] ?? 0
    rgb[target + 2] = rgba[source + 2] ?? 0
  }
  return rgb
}

function difference(reference: Uint8Array, rendered: Uint8Array): { mean: number; p99: number } {
  const values: number[] = []
  const inset = 12
  // The comparison starts below the panel's one line of text: the check is
  // about the frosted backdrop, and glyph edges anti-alias differently in
  // Chromium and pdftoppm across platforms. Text is checked by extraction.
  const textBottom = 120
  const x0 = Math.floor((PANEL.x + inset) * SCALE)
  const y0 = Math.floor((PANEL.y + textBottom) * SCALE)
  const x1 = Math.ceil((PANEL.x + PANEL.width - inset) * SCALE)
  const y1 = Math.ceil((PANEL.y + PANEL.height - inset) * SCALE)
  const width = Math.round(WIDTH * SCALE)
  let total = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (let channel = 0; channel < 3; channel++) {
        const offset = (y * width + x) * 3 + channel
        const value = Math.abs((reference[offset] ?? 0) - (rendered[offset] ?? 0))
        values.push(value)
        total += value
      }
    }
  }
  values.sort((left, right) => left - right)
  return { mean: total / values.length, p99: values[Math.floor(values.length * 0.99)] ?? 255 }
}

export async function verifyBackdropRaster(renderer: Renderer, work: string, check: Check): Promise<void> {
  const page = { html, size: { width: WIDTH, height: HEIGHT } } as const
  const pdfFile = path.join(work, 'backdrop.pdf')
  const rasterPrefix = path.join(work, 'backdrop-pdf')
  const screen = await pngPixels(renderer, await renderer.pageImage(page, { format: 'png', scale: SCALE }))
  const pdf = await renderer.pagePdf(page)
  writeFileSync(pdfFile, pdf)
  // At 150 dpi the 480 CSS px page rasterizes to the screen capture's 750 px.
  execFileSync('pdftoppm', ['-r', '150', '-singlefile', pdfFile, rasterPrefix])
  const raster = readPpm(`${rasterPrefix}.ppm`)
  const sameSize = raster.width === screen.width && raster.height === screen.height
  const score = difference(rgbOf(screen.rgba), raster.pixels)
  check(
    'a frosted panel PDF matches its screen region within the effects bar',
    sameSize && score.mean <= 2 && score.p99 <= 24,
    `screen=${screen.width}x${screen.height}, pdf=${raster.width}x${raster.height}, mean=${score.mean.toFixed(2)}, p99=${score.p99}`,
  )
  const text = execFileSync('pdftotext', [pdfFile, '-'], { encoding: 'utf8' })
  check('frosted panel text remains extractable', text.replace(/\s+/g, ' ').includes('FROSTED selectable'))
  const document = await loadPdf(pdf)
  // Adobe draws an isolated group that declares no colour space with muted
  // colours, so every transparency group on the page must name its space.
  const groups = document.context
    .enumerateIndirectObjects()
    .map(([, object]) => (object instanceof PDFRawStream ? object.dict : object))
    .filter((object): object is PDFDict => object instanceof PDFDict)
    .map((dict) => dict.get(PDFName.of('Group')))
    .filter((group): group is PDFDict => group instanceof PDFDict && group.get(PDFName.of('S'))?.toString() === '/Transparency')
  check(
    'every transparency group on a backdrop raster page declares its colour space',
    groups.length > 0 && groups.every((group) => group.has(PDFName.of('CS'))),
    `groups=${groups.length}`,
  )
  const image = document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('SegnaviaBackdropRaster')))
  check(
    'the frosted panel is a tagged 150 dpi DCT image',
    image?.dict.get(PDFName.of('Filter'))?.toString() === '/DCTDecode' &&
      Math.abs(Number(image.dict.get(PDFName.of('Width'))?.toString()) - (PANEL.width * 150) / 96) <= 1 &&
      Math.abs(Number(image.dict.get(PDFName.of('Height'))?.toString()) - (PANEL.height * 150) / 96) <= 1,
  )
  check(
    'a backdrop raster adds only a DeviceRGB image and no ICC profile',
    image?.dict.get(PDFName.of('ColorSpace'))?.toString() === '/DeviceRGB' &&
      !Buffer.from(pdf).includes(Buffer.from('/ICCBased')) &&
      !Buffer.from(pdf).includes(Buffer.from('ICC_PROFILE')),
  )
  const plain = { html: '<p>no effects</p>', size: { width: 200, height: 100 } } as const
  const [enabled, disabled] = await Promise.all([renderer.pagePdf(plain), renderer.pagePdf(plain, { effects: false })])
  check('a page without backdrop-filter is byte-identical with effects enabled or disabled', Buffer.compare(enabled, disabled) === 0)
}
