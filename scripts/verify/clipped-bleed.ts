import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { MM_PER_PT, Page, PX_PER_MM, printBoxes } from '@segnavia/format'
import type { OverflowReport, Renderer } from '@segnavia/render'
import { readPpm } from './pdf-raster.ts'

const close = (left: number, right: number, tolerance: number) => Math.abs(left - right) <= tolerance

function ppmRedBounds(file: string): number[] | undefined {
  const { width, height, pixels } = readPpm(file)
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 3
      const red = pixels[pixel] ?? 255
      const green = pixels[pixel + 1] ?? 255
      const blue = pixels[pixel + 2] ?? 255
      if (red >= 110 && red <= 130 && green < 10 && blue < 10) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  }
  return right < left ? undefined : [left / 4, top / 4, (right + 1) / 4, (bottom + 1) / 4]
}

async function verifyClipMargin(renderer: Renderer, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  let report: OverflowReport | undefined
  await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.clip{width:400px;height:200px;overflow:clip;overflow-clip-margin:100px}.overflow{position:absolute;left:350px;width:100px;height:100px}</style><div class="clip"><div id="clip-margin-overflow" class="overflow"></div></div>',
      print: { paper: { width: 105.833333, height: 79.375, unit: 'mm' }, orientation: 'portrait' },
    },
    { effects: false, overflow: { report: (value) => (report = value) } },
  )
  const entry = report?.entries[0]
  check(
    'visible overflow inside an overflow clip margin raises the scale and stays in the report',
    (entry?.scale ?? 0) > 1 && entry?.elements.some((element) => element.locator === '#clip-margin-overflow') === true,
    `scale=${entry?.scale}, elements=${entry?.elements.map((element) => element.locator).join(',')}`,
  )
}

export async function verifyClippedBleed(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const page = Page.parse({
    html: `<!doctype html><style>
      *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%}body{overflow:hidden;position:relative}
      #trim{position:absolute;inset:var(--segnavia-bleed);overflow:hidden}
      #text{position:absolute;left:24px;top:20px;width:160px;height:24px;overflow:visible;background:rgb(120,0,0)}
      #marker{font:16px Arial,sans-serif}
      #bleed{position:absolute;right:-18px;bottom:12px;width:80px;height:80px;transform:rotate(20deg);background:black}
      @media print{html,body{width:auto;height:auto;min-height:0}body{position:fixed;inset:0}}
    </style><body><div id="trim"><svg id="text"><text id="marker" x="0" y="16">BLEED_MARKER</text></svg><div id="bleed"></div></div></body>`,
    size: 'fluid',
    print: { paper: { width: 100, height: 60, unit: 'mm' }, orientation: 'landscape', bleed: 3 },
  })
  if (!page.print) throw new Error('The clipped-bleed fixture has no print setting.')
  let report: OverflowReport | undefined
  let screen: { x: number; y: number; width: number; height: number } | undefined
  const bytes = await renderer.pagesPdf([page], {
    effects: false,
    overflow: { report: (value) => (report = value) },
    beforeOutput: async (tab) => {
      await tab.emulateMedia({ media: 'print' })
      screen = await tab.locator('#text').evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      })
    },
  })
  const file = path.join(work, 'clipped-bleed.pdf')
  writeFileSync(file, bytes)
  const info = execFileSync('pdfinfo', ['-box', file], { encoding: 'utf8' })
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const raster = path.join(work, 'clipped-bleed')
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-r', '288', file, raster])
  const actualBox = (name: string) =>
    info
      .match(new RegExp(`${name}:\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)`))
      ?.slice(1)
      .map(Number)
  const boxes = printBoxes(page.print)
  const expectedBox = (box: { x: number; y: number; width: number; height: number }) =>
    [box.x, boxes.media.height - box.y - box.height, box.x + box.width, boxes.media.height - box.y].map((mm) => mm / MM_PER_PT)
  const closeBox = (actual: number[] | undefined, expected: number[]) =>
    actual?.every((value, index) => close(value, expected[index] ?? Number.NaN, 0.5)) ?? false
  const trimScreen = page.print.bleed * PX_PER_MM
  const expectedText = screen
    ? [
        boxes.trim.x / MM_PER_PT + (screen.x - trimScreen) * 0.75,
        boxes.trim.y / MM_PER_PT + (screen.y - trimScreen) * 0.75,
        boxes.trim.x / MM_PER_PT + (screen.x + screen.width - trimScreen) * 0.75,
        boxes.trim.y / MM_PER_PT + (screen.y + screen.height - trimScreen) * 0.75,
      ]
    : []
  const actualText = ppmRedBounds(`${raster}.ppm`)
  const scale = report?.entries[0]?.scale
  const textGeometry =
    actualText && expectedText.length === 4
      ? {
          horizontal: close(actualText[0] ?? Number.NaN, expectedText[0] ?? Number.NaN, 0.5),
          vertical: close(actualText[1] ?? Number.NaN, expectedText[1] ?? Number.NaN, 1.5),
          width: close((actualText[2] ?? Number.NaN) - (actualText[0] ?? Number.NaN), (expectedText[2] ?? Number.NaN) - (expectedText[0] ?? Number.NaN), 0.5),
          height: close((actualText[3] ?? Number.NaN) - (actualText[1] ?? Number.NaN), (expectedText[3] ?? Number.NaN) - (expectedText[1] ?? Number.NaN), 0.5),
          verticalOffset: (actualText[1] ?? Number.NaN) - (expectedText[1] ?? Number.NaN),
        }
      : undefined
  check(
    'content crossing a 3mm bleed under a clipping body keeps the screen print geometry',
    scale === 1 &&
      closeBox(actualBox('MediaBox'), [0, 0, boxes.media.width / MM_PER_PT, boxes.media.height / MM_PER_PT]) &&
      closeBox(actualBox('BleedBox'), expectedBox(boxes.bleedBox)) &&
      closeBox(actualBox('TrimBox'), expectedBox(boxes.trim)) &&
      xml.includes('BLEED_MARKER') &&
      textGeometry?.horizontal === true &&
      textGeometry.vertical &&
      textGeometry.width &&
      textGeometry.height,
    `scale=${scale}, boxes=${[actualBox('MediaBox'), actualBox('BleedBox'), actualBox('TrimBox')].map((box) => box?.join('/')).join(',')}, text=${actualText?.join('/')}/${expectedText.join('/')}, vertical offset=${textGeometry?.verticalOffset}pt, px/mm=${PX_PER_MM}`,
  )

  await verifyClipMargin(renderer, check)
}
