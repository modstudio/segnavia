import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { pointMultiset, unpointed } from './hebrew-text.ts'
import { readPpm } from './pdf-raster.ts'
import { differencePixels, EFFECT_REGION_THRESHOLD, READER_RASTER_DPI, SCALE } from './pixel-difference.ts'
import { decodePng } from './png-pixels.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const PAGE = { width: 816, height: 1056 }

function downsample(source: Uint8Array, width: number, height: number): Uint8Array {
  if (width % SCALE !== 0 || height % SCALE !== 0 || source.length !== width * height * 3) throw new Error(`Unexpected ${SCALE}x raster size.`)
  const targetWidth = width / SCALE
  const targetHeight = height / SCALE
  const target = new Uint8Array(targetWidth * targetHeight * 3)
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) sum += source[((y * SCALE + dy) * width + x * SCALE + dx) * 3 + channel] ?? 0
        }
        target[(y * targetWidth + x) * 3 + channel] = Math.round(sum / SCALE ** 2)
      }
    }
  }
  return target
}

const text = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim()

function pointedLines(html: string): string[] {
  return [...html.matchAll(/<[^>]+\sdata-pointed(?:\s[^>]*)?>([^<]+)<\/[^>]+>/g)].map((match) => text(match[1] ?? ''))
}

function fontRows(output: string): string[] {
  return output
    .split('\n')
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function verifyHebrewNotice(renderer: Renderer, work: string, check: Check): Promise<void> {
  const fixture = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice')
  const html = readFileSync(path.join(fixture, 'index.html'), 'utf8')
  const page = { html, size: PAGE, lang: 'he', dir: 'rtl' as const }
  const options = {
    fonts: [{ family: 'Notice Hebrew', data: readFileSync(path.join(fixture, 'Alef-Regular.ttf')), format: 'truetype' as const }],
  }
  const [pdf, image] = await Promise.all([renderer.pagePdf(page, options), renderer.pageImage(page, { ...options, format: 'png', scale: SCALE })])
  const pdfFile = path.join(work, 'hebrew-notice.pdf')
  writeFileSync(pdfFile, pdf)

  const fonts = execFileSync('pdffonts', [pdfFile], { encoding: 'utf8' })
  const rows = fontRows(fonts)
  const expectedFace = rows.length > 0 && rows.every((row) => /^\S*\+Alef-Regular\s/.test(row) && /\syes\s+yes\s+yes\s+\d+\s+\d+$/.test(row))
  check('the pointed Hebrew notice embeds only its supplied Hebrew face', expectedFace, rows.join('; '))

  const extractedText = execFileSync('pdftotext', [pdfFile, '-'], { encoding: 'utf8' })
  const sourceLines = pointedLines(html)
  const sourcePoints = pointMultiset(sourceLines.join(''))
  const extractedPoints = pointMultiset(extractedText)
  check(
    'the pointed Hebrew notice text layer retains every Hebrew point',
    extractedPoints === sourcePoints,
    `source=${sourcePoints.length}, extracted=${extractedPoints.length}`,
  )
  const extracted = unpointed(extractedText)
  let cursor = 0
  const missing = sourceLines.filter((line) => {
    const expected = unpointed(line)
    const found = extracted.indexOf(expected, cursor)
    if (found < 0) return true
    cursor = found + expected.length
    return false
  })
  check('the pointed Hebrew notice extracts its source lines in logical order', missing.length === 0, missing.join(' | '))

  const prefix = path.join(work, 'hebrew-notice-pdf')
  execFileSync('pdftoppm', ['-r', String(READER_RASTER_DPI), '-singlefile', pdfFile, prefix])
  const raster = readPpm(`${prefix}.ppm`)
  const screen = decodePng(image)
  const sameSize =
    raster.width === screen.width && raster.height === screen.height && raster.width === PAGE.width * SCALE && raster.height === PAGE.height * SCALE
  const screenPixels = sameSize ? downsample(screen.pixels, screen.width, screen.height) : new Uint8Array()
  const rasterPixels = sameSize ? downsample(raster.pixels, raster.width, raster.height) : new Uint8Array()
  const difference = sameSize ? differencePixels(screenPixels, rasterPixels, PAGE.width, PAGE.height) : { mean: Number.POSITIVE_INFINITY, p99: 255 }
  const pagePass = difference.mean <= EFFECT_REGION_THRESHOLD.mean && difference.p99 <= EFFECT_REGION_THRESHOLD.p99
  check(
    'the pointed Hebrew notice PDF raster matches its page image within the effects bar',
    sameSize && pagePass,
    `source=${screen.width}x${screen.height}, pdf=${raster.width}x${raster.height}, compared=${PAGE.width}x${PAGE.height}, mean=${difference.mean.toFixed(2)}, p99=${difference.p99}`,
  )
}
