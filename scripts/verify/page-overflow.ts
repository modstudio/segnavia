import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { MM_PER_PT, Page, PX_PER_MM, printBoxes } from '@segnavia/format'
import type { OverflowReport, Renderer } from '@segnavia/render'
import { chromium } from 'playwright-core'
import { pageContentScale } from './pdf-content.ts'

interface PdfFacts {
  pages: number
  markerX: number
  markerY: number
  markerWidth: number
  fixed: number
}

function pdfFacts(bytes: Uint8Array, work: string, name: string): PdfFacts {
  const file = path.join(work, `${name}.pdf`)
  writeFileSync(file, bytes)
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const marker = xml.match(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)"[^>]*>FLOW_MARKER<\/word>/)
  return {
    pages: Number(info.match(/Pages:\s+(\d+)/)?.[1]),
    markerX: Number(marker?.[1]),
    markerY: Number(marker?.[2]),
    markerWidth: Number(marker?.[3]) - Number(marker?.[1]),
    fixed: xml.match(/FIXED_MARKER/g)?.length ?? 0,
  }
}

const close = (left: number, right: number, tolerance = 1) => Math.abs(left - right) <= tolerance

function ppmRedBounds(file: string): number[] | undefined {
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
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = offset + (y * width + x) * 3
      const red = bytes[pixel] ?? 255
      const green = bytes[pixel + 1] ?? 255
      const blue = bytes[pixel + 2] ?? 255
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
  check(
    'content crossing a 3mm bleed under a clipping body keeps the screen print geometry',
    scale === 1 &&
      closeBox(actualBox('MediaBox'), [0, 0, boxes.media.width / MM_PER_PT, boxes.media.height / MM_PER_PT]) &&
      closeBox(actualBox('BleedBox'), expectedBox(boxes.bleedBox)) &&
      closeBox(actualBox('TrimBox'), expectedBox(boxes.trim)) &&
      xml.includes('BLEED_MARKER') &&
      closeBox(actualText, expectedText),
    `scale=${scale}, boxes=${[actualBox('MediaBox'), actualBox('BleedBox'), actualBox('TrimBox')].map((box) => box?.join('/')).join(',')}, text=${actualText?.join('/')}/${expectedText.join('/')}, px/mm=${PX_PER_MM}`,
  )
}

function flowingHtml(width?: number, rtl = false): string {
  const wide = width === undefined ? '' : `<div class="wide"></div>`
  return `<style>html,body{margin:0}.flow{font:16px/24px serif;width:300px}.fixed{position:fixed;top:8px;left:200px}.wide{position:absolute;top:60px;${rtl ? 'right' : 'left'}:0;width:${width}px;height:1px}</style><div class="fixed">FIXED_MARKER</div><p class="flow">FLOW_MARKER ${'flowing text '.repeat(700)}</p>${wide}`
}

function pgmPixel(file: string, x: number, y: number): number {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while ((bytes[offset] ?? 0) <= 32) offset++
    const start = offset
    while ((bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P5') throw new Error(`The raster at ${file} is not a raw PGM.`)
  const width = Number(token())
  token()
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit grayscale.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return bytes[offset + y * width + x] ?? 255
}

async function verifyRtlOverflow(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const baseline = await renderer.pagePdf({ html: flowingHtml(undefined, true), size: { width: 400, height: 'auto' }, dir: 'rtl' }, { effects: false })
  const baselineFacts = pdfFacts(baseline, work, 'rtl-baseline')
  for (const [label, leftward] of [
    ['inline-start', false],
    ['leftward inline-end', true],
  ] as const) {
    let report: OverflowReport | undefined
    const bytes = await renderer.pagePdf(
      { html: flowingHtml(1200, leftward), size: { width: 400, height: 'auto' }, dir: 'rtl' },
      { effects: false, overflow: { report: (value) => (report = value) } },
    )
    const facts = pdfFacts(bytes, work, `rtl-${leftward ? 'end' : 'start'}-overflow`)
    const entry = report?.entries[0]
    check(
      `a right-to-left page clips ${label} overflow while keeping text at true size`,
      close(facts.markerX, baselineFacts.markerX) &&
        close(facts.markerY, baselineFacts.markerY) &&
        close(facts.markerWidth, baselineFacts.markerWidth) &&
        close(leftward ? (entry?.clippedEnd ?? Number.NaN) : (entry?.clippedStart ?? Number.NaN), 800) &&
        (leftward ? entry?.clippedStart === 0 : entry?.clippedEnd === 0),
      `marker=${facts.markerX},${facts.markerY}/${baselineFacts.markerX},${baselineFacts.markerY}, clipped=${entry?.clippedStart}/${entry?.clippedEnd}`,
    )
  }
}

async function verifyAdaptiveOverflow(
  renderer: Renderer,
  work: string,
  paper: { width: number; height: number; unit: 'mm' },
  baseline: PdfFacts,
  check: (what: string, ok: boolean, detail?: string) => void,
): Promise<void> {
  for (const [label, block] of [
    ['page-relative padding', '<div style="width:100%;padding-inline-end:20px;height:20px"></div>'],
    ['page-relative border', '<div style="width:100%;border:0.3px solid;height:20px"></div>'],
    ['mixed page-relative and fixed', '<div style="width:100%;padding-inline-end:120px;height:20px"></div><div style="width:500px;height:20px"></div>'],
  ] as const) {
    let report: OverflowReport | undefined
    const bytes = await renderer.pagePdf(
      {
        html: `<style>html,body{margin:0}.flow{font:16px/24px serif;width:300px}.fixed{position:fixed;top:8px;left:200px}</style><div class="fixed">FIXED_MARKER</div><p class="flow">FLOW_MARKER ${'flowing text '.repeat(700)}</p>${block}`,
        print: { paper, orientation: 'portrait' },
      },
      { effects: false, overflow: { report: (value) => (report = value) } },
    )
    const facts = pdfFacts(bytes, work, `overflow-${label.replaceAll(' ', '-')}`)
    const entry = report?.entries[0]
    check(
      `${label} overflow uses a solved scale and keeps text and page breaks at true size`,
      close(facts.markerX, baseline.markerX) &&
        close(facts.markerY, baseline.markerY) &&
        close(facts.markerWidth, baseline.markerWidth) &&
        facts.pages === baseline.pages &&
        facts.fixed === facts.pages &&
        entry !== undefined &&
        entry.scale >= 1 &&
        entry.scale <= 1.5,
      `marker=${facts.markerX},${facts.markerY},${facts.markerWidth}/${baseline.markerX},${baseline.markerY},${baseline.markerWidth}, pages=${facts.pages}/${baseline.pages}, fixed=${facts.fixed}, clipped=${entry?.clippedEnd}, scale=${entry?.scale}`,
    )
  }
}

export async function verifyPageOverflow(
  renderer: Renderer,
  work: string,
  check: (what: string, ok: boolean, detail?: string) => void,
  executablePath: string,
): Promise<void> {
  let fixedReport: OverflowReport | undefined
  const overflowing = await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.overflow{position:absolute;left:360px;top:80px;width:100px;height:100px;background:black;transform:rotate(20deg)}</style><div class="overflow"></div>',
      size: { width: 400, height: 300 },
    },
    { effects: false, overflow: { report: (value) => (fixedReport = value) } },
  )
  const overflowScale = await pageContentScale(overflowing)
  check(
    'a fixed page with sideways overflow prints at its own scale',
    Math.abs(overflowScale - 3.125) < 0.000001 && Number(fixedReport?.entries[0]?.clippedEnd) > 0,
    `cm=${overflowScale}, scale=${overflowScale * 0.24}pt/CSS px, clipped=${fixedReport?.entries[0]?.clippedEnd}`,
  )

  const paper = { width: 105.833333, height: 132.291667, unit: 'mm' as const }
  const baseline = await renderer.pagePdf({ html: flowingHtml(), print: { paper, orientation: 'portrait' } }, { effects: false })
  const baselineFacts = pdfFacts(baseline, work, 'overflow-baseline')
  for (const [label, width] of [
    ['1.25x', 500],
    ['3x', 1200],
  ] as const) {
    let report: OverflowReport | undefined
    const bytes = await renderer.pagePdf(
      { html: flowingHtml(width), print: { paper, orientation: 'portrait' } },
      { effects: false, overflow: { report: (value) => (report = value) } },
    )
    const facts = pdfFacts(bytes, work, `overflow-${label}`)
    const entry = report?.entries[0]
    check(
      `a ${label} overflow on a multi-page pagePdf keeps text, page breaks and repeated fixed content at true size`,
      close(facts.markerX, baselineFacts.markerX) &&
        close(facts.markerY, baselineFacts.markerY) &&
        close(facts.markerWidth, baselineFacts.markerWidth) &&
        facts.pages === baselineFacts.pages &&
        facts.fixed === facts.pages &&
        entry !== undefined &&
        close(entry.clippedEnd, width - 400) &&
        entry.clippedStart === 0,
      `marker=${facts.markerX},${facts.markerY},${facts.markerWidth}/${baselineFacts.markerX},${baselineFacts.markerY},${baselineFacts.markerWidth}, pages=${facts.pages}/${baselineFacts.pages}, fixed=${facts.fixed}, clipped=${entry?.clippedEnd}, scale=${entry?.scale}`,
    )
  }

  await verifyAdaptiveOverflow(renderer, work, paper, baselineFacts, check)

  let leftwardReport: OverflowReport | undefined
  const leftward = await renderer.pagePdf(
    { html: flowingHtml(1200, true), print: { paper, orientation: 'portrait' } },
    { effects: false, overflow: { report: (value) => (leftwardReport = value) } },
  )
  const leftwardFacts = pdfFacts(leftward, work, 'overflow-ltr-leftward')
  check(
    'a left-to-right page clips leftward overflow without counter-scaling',
    close(leftwardFacts.markerX, baselineFacts.markerX) &&
      close(leftwardFacts.markerY, baselineFacts.markerY) &&
      close(leftwardFacts.markerWidth, baselineFacts.markerWidth) &&
      leftwardFacts.pages === baselineFacts.pages &&
      close(leftwardReport?.entries[0]?.clippedStart ?? Number.NaN, 800) &&
      leftwardReport?.entries[0]?.clippedEnd === 0,
    `marker=${leftwardFacts.markerX},${leftwardFacts.markerY}/${baselineFacts.markerX},${baselineFacts.markerY}, pages=${leftwardFacts.pages}/${baselineFacts.pages}, clipped=${leftwardReport?.entries[0]?.clippedStart}/${leftwardReport?.entries[0]?.clippedEnd}`,
  )

  for (const [label, printOnly] of [
    ['generated content', false],
    ['print-media content', true],
  ] as const) {
    const media = printOnly ? '@media print{.wide::before{width:1200px}}' : ''
    const width = printOnly ? 1 : 1200
    let report: OverflowReport | undefined
    const bytes = await renderer.pagePdf(
      {
        html: `<style>html,body{margin:0}.flow{font:16px/24px serif;width:300px}.wide{position:relative;width:1px;height:1px}.wide::before{content:'';position:absolute;left:0;width:${width}px;height:10px}${media}</style><p class="flow">FLOW_MARKER ${'flowing text '.repeat(700)}</p><div class="wide"></div>`,
        print: { paper, orientation: 'portrait' },
      },
      { effects: false, overflow: { report: (value) => (report = value) } },
    )
    const facts = pdfFacts(bytes, work, `overflow-${printOnly ? 'print-media' : 'generated'}`)
    check(
      `${label} overflow prints at true size and reports its complete scrollable overflow`,
      close(facts.markerX, baselineFacts.markerX) &&
        close(facts.markerY, baselineFacts.markerY) &&
        close(facts.markerWidth, baselineFacts.markerWidth) &&
        facts.pages === baselineFacts.pages &&
        close(report?.entries[0]?.clippedEnd ?? Number.NaN, 800),
      `marker=${facts.markerX},${facts.markerY}/${baselineFacts.markerX},${baselineFacts.markerY}, pages=${facts.pages}/${baselineFacts.pages}, clipped=${report?.entries[0]?.clippedEnd}`,
    )
  }

  const browser = await chromium.launch({ executablePath })
  try {
    const raw = async (width?: number) => {
      const tab = await browser.newPage({ viewport: { width: 400, height: 500 } })
      await tab.setContent(flowingHtml(width))
      const bytes = await tab.pdf({ width: '400px', height: '500px', printBackground: true })
      await tab.close()
      return pageContentScale(bytes)
    }
    const rawBaseline = await raw()
    const rawOverflow = await raw(1200)
    check(
      "Chromium's measured maximum print shrink is 1.5",
      close(rawBaseline / rawOverflow, 1.5, 0.000001),
      `baseline=${rawBaseline}, overflow=${rawOverflow}, shrink=${rawBaseline / rawOverflow}`,
    )
  } finally {
    await browser.close()
  }

  let growingReport: OverflowReport | undefined
  const growingOverflow = await renderer.pagePdf(
    { html: flowingHtml(1200), size: { width: 400, height: 'auto' } },
    { effects: false, overflow: { report: (value) => (growingReport = value) } },
  )
  const growingBaseline = await renderer.pagePdf({ html: flowingHtml(), size: { width: 400, height: 'auto' } }, { effects: false })
  const growingOverflowFacts = pdfFacts(growingOverflow, work, 'growing-overflow')
  const growingBaselineFacts = pdfFacts(growingBaseline, work, 'growing-baseline')
  check(
    'a growing page with sideways overflow keeps text and page count at true size and reports clipping',
    close(growingOverflowFacts.markerX, growingBaselineFacts.markerX) &&
      close(growingOverflowFacts.markerY, growingBaselineFacts.markerY) &&
      close(growingOverflowFacts.markerWidth, growingBaselineFacts.markerWidth) &&
      growingOverflowFacts.pages === growingBaselineFacts.pages &&
      close(growingReport?.entries[0]?.clippedEnd ?? Number.NaN, 800),
    `marker=${growingOverflowFacts.markerX},${growingOverflowFacts.markerY}/${growingBaselineFacts.markerX},${growingBaselineFacts.markerY}, pages=${growingOverflowFacts.pages}/${growingBaselineFacts.pages}, clipped=${growingReport?.entries[0]?.clippedEnd}`,
  )

  await verifyRtlOverflow(renderer, work, check)

  const growing = await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.bottom{position:absolute;top:1500px;left:20px;width:100px;height:100px;background:black}</style><div class="bottom"></div>',
      size: { width: 400, height: 'auto' },
    },
    { effects: false },
  )
  const growingFile = path.join(work, 'growing-absolute.pdf')
  const growingRaster = path.join(work, 'growing-absolute')
  writeFileSync(growingFile, growing)
  const growingInfo = execFileSync('pdfinfo', [growingFile], { encoding: 'utf8' })
  const growingHeight = Number(growingInfo.match(/Page size:\s+[\d.]+ x ([\d.]+) pts/)?.[1])
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-gray', '-r', '72', growingFile, growingRaster])
  const bottomPixel = pgmPixel(`${growingRaster}.pgm`, 50, 1160)
  check(
    'a growing page measures and paints absolutely positioned vertical content',
    Math.abs(growingHeight - 1200) < 0.01 && bottomPixel < 32,
    `height=${growingHeight}pt, bottom=${bottomPixel}`,
  )

  const repeatedFixed = await renderer.pagePdf(
    {
      html: '<style>body{margin:0}.fixed{position:fixed;top:20px;left:20px}.long{height:40in}</style><div class="fixed">FIXED_ON_EVERY_PAGE</div><div class="long"></div>',
      print: { paper: 'letter', orientation: 'portrait' },
    },
    { effects: false },
  )
  const repeatedFixedFile = path.join(work, 'repeated-fixed.pdf')
  writeFileSync(repeatedFixedFile, repeatedFixed)
  const repeatedFixedPages = Number(execFileSync('pdfinfo', [repeatedFixedFile], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1])
  const repeatedFixedText = execFileSync('pdftotext', [repeatedFixedFile, '-'], { encoding: 'utf8' })
  const repeatedFixedCount = repeatedFixedText.match(/FIXED_ON_EVERY_PAGE/g)?.length ?? 0
  check(
    'a fixed element repeats on every page of a multi-page print',
    repeatedFixedPages >= 3 && repeatedFixedCount === repeatedFixedPages,
    `fixed=${repeatedFixedCount}, pages=${repeatedFixedPages}`,
  )
}
