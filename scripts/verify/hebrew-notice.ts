import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { differencePixels } from '../fidelity/image.ts'
import { pngPixels } from './browser-pixels.ts'
import { readPpm } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const DPI = 144
const SCALE = DPI / 96
const PAGE = { width: 816, height: 1056 }

function rgb(rgba: number[]): Uint8Array {
  const pixels = new Uint8Array((rgba.length / 4) * 3)
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    pixels[target] = rgba[source] ?? 0
    pixels[target + 1] = rgba[source + 1] ?? 0
    pixels[target + 2] = rgba[source + 2] ?? 0
  }
  return pixels
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

  const extracted = text(execFileSync('pdftotext', ['-layout', pdfFile, '-'], { encoding: 'utf8' }))
  let cursor = 0
  const missing = pointedLines(html).filter((line) => {
    const found = extracted.indexOf(line, cursor)
    if (found < 0) return true
    cursor = found + line.length
    return false
  })
  check('the pointed Hebrew notice extracts its source lines in logical order with every point', missing.length === 0, missing.join(' | '))

  const prefix = path.join(work, 'hebrew-notice-pdf')
  execFileSync('pdftoppm', ['-r', String(DPI), '-singlefile', pdfFile, prefix])
  const raster = readPpm(`${prefix}.ppm`)
  const screen = await pngPixels(renderer, image)
  const sameSize = raster.width === screen.width && raster.height === screen.height
  const difference = sameSize ? differencePixels(rgb(screen.rgba), raster.pixels, raster.width, raster.height) : { mean: Number.POSITIVE_INFINITY, p99: 255 }
  check(
    'the pointed Hebrew notice PDF raster matches its page image within the effects bar',
    sameSize && difference.mean <= 2 && difference.p99 <= 24,
    `screen=${screen.width}x${screen.height}, pdf=${raster.width}x${raster.height}, mean=${difference.mean.toFixed(2)}, p99=${difference.p99}`,
  )
}
