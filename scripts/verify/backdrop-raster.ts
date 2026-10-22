import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { PDFDict, PDFName, PDFRawStream } from 'pdf-lib'
import { loadPdf } from '../../packages/render/src/pdf-load.ts'

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

function rgb(file: string, width: number, height: number): Uint8Array {
  return execFileSync(
    'ffmpeg',
    ['-loglevel', 'error', '-i', file, '-vf', `scale=${width}:${height}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    {
      maxBuffer: width * height * 4,
    },
  )
}

function difference(reference: Uint8Array, rendered: Uint8Array): { mean: number; p99: number } {
  const values: number[] = []
  const inset = 12
  const x0 = Math.floor((PANEL.x + inset) * SCALE)
  const y0 = Math.floor((PANEL.y + inset) * SCALE)
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
  const screen = path.join(work, 'backdrop-screen.png')
  const pdfFile = path.join(work, 'backdrop.pdf')
  const rasterPrefix = path.join(work, 'backdrop-pdf')
  writeFileSync(screen, await renderer.pageImage(page, { format: 'png', scale: SCALE }))
  const pdf = await renderer.pagePdf(page)
  writeFileSync(pdfFile, pdf)
  execFileSync('pdftoppm', ['-r', '150', '-png', '-singlefile', pdfFile, rasterPrefix])
  const width = Math.round(WIDTH * SCALE)
  const height = Math.round(HEIGHT * SCALE)
  const score = difference(rgb(screen, width, height), rgb(`${rasterPrefix}.png`, width, height))
  check(
    'a frosted panel PDF matches its screen region within the effects bar',
    score.mean <= 2 && score.p99 <= 24,
    `mean=${score.mean.toFixed(2)}, p99=${score.p99}`,
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
