import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { OverflowReport, Renderer } from '@segnavia/render'
import { chromium } from 'playwright-core'
import { pageContentScale } from './pdf-content.ts'

interface PdfFacts {
  pages: number
  markerX: number
  markerY: number
  fixed: number
}

function pdfFacts(bytes: Uint8Array, work: string, name: string): PdfFacts {
  const file = path.join(work, `${name}.pdf`)
  writeFileSync(file, bytes)
  const info = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  const marker = xml.match(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>FLOW_MARKER<\/word>/)
  return {
    pages: Number(info.match(/Pages:\s+(\d+)/)?.[1]),
    markerX: Number(marker?.[1]),
    markerY: Number(marker?.[2]),
    fixed: xml.match(/FIXED_MARKER/g)?.length ?? 0,
  }
}

const close = (left: number, right: number, tolerance = 1) => Math.abs(left - right) <= tolerance

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
    Math.abs(overflowScale - 3.125) < 0.000001 && (fixedReport?.entries[0]?.clippedEnd ?? 0) > 0,
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
        facts.pages === baselineFacts.pages &&
        facts.fixed === facts.pages &&
        entry !== undefined &&
        close(entry.clippedEnd, width - 400) &&
        entry.clippedStart === 0,
      `marker=${facts.markerX},${facts.markerY}/${baselineFacts.markerX},${baselineFacts.markerY}, pages=${facts.pages}/${baselineFacts.pages}, fixed=${facts.fixed}, clipped=${entry?.clippedEnd}`,
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
      growingOverflowFacts.pages === growingBaselineFacts.pages &&
      close(growingReport?.entries[0]?.clippedEnd ?? Number.NaN, 800),
    `marker=${growingOverflowFacts.markerX},${growingOverflowFacts.markerY}/${growingBaselineFacts.markerX},${growingBaselineFacts.markerY}, pages=${growingOverflowFacts.pages}/${growingBaselineFacts.pages}, clipped=${growingReport?.entries[0]?.clippedEnd}`,
  )

  let rtlReport: OverflowReport | undefined
  const rtlOverflow = await renderer.pagePdf(
    { html: flowingHtml(1200, true), size: { width: 400, height: 'auto' }, dir: 'rtl' },
    { effects: false, overflow: { report: (value) => (rtlReport = value) } },
  )
  const rtlBaseline = await renderer.pagePdf({ html: flowingHtml(undefined, true), size: { width: 400, height: 'auto' }, dir: 'rtl' }, { effects: false })
  const rtlOverflowFacts = pdfFacts(rtlOverflow, work, 'rtl-overflow')
  const rtlBaselineFacts = pdfFacts(rtlBaseline, work, 'rtl-baseline')
  check(
    'a right-to-left page clips inline-start overflow while keeping text at true size',
    close(rtlOverflowFacts.markerX, rtlBaselineFacts.markerX) &&
      close(rtlOverflowFacts.markerY, rtlBaselineFacts.markerY) &&
      close(rtlReport?.entries[0]?.clippedStart ?? Number.NaN, 800) &&
      rtlReport?.entries[0]?.clippedEnd === 0,
    `marker=${rtlOverflowFacts.markerX},${rtlOverflowFacts.markerY}/${rtlBaselineFacts.markerX},${rtlBaselineFacts.markerY}, clipped=${rtlReport?.entries[0]?.clippedStart}/${rtlReport?.entries[0]?.clippedEnd}`,
  )

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
