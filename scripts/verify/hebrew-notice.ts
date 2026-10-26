import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { differencePixels } from '../fidelity/image.ts'
import { imageSize } from './image-size.ts'
import { readPpm } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const DPI = 384
const SCALE = DPI / 96
const PDF_SCALE = DPI / 72
const PAGE = { width: 816, height: 1056 }
const POINTS = /[\u0591-\u05c7]/g

function rgbFile(file: string, width: number, height: number): Uint8Array {
  const pixels = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {
    maxBuffer: width * height * 3 + 1024,
  })
  if (pixels.length !== width * height * 3) throw new Error(`Unexpected decoded size for ${path.basename(file)}.`)
  return pixels
}

const text = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim()
const unpointed = (value: string): string => value.normalize('NFC').replace(POINTS, '').replace(/\s+/g, '')

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

function pointedLineBoxes(xml: string): Array<{ x: number; y: number; width: number; height: number }> {
  return [...xml.matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g)]
    .filter((match) => /[\u0591-\u05c7]/.test(match[5] ?? ''))
    .map((match) => {
      const xMin = Number(match[1])
      const yMin = Number(match[2])
      const xMax = Number(match[3])
      const yMax = Number(match[4])
      return {
        x: xMin * PDF_SCALE - 4,
        y: yMin * PDF_SCALE - 4,
        width: (xMax - xMin) * PDF_SCALE + 8,
        height: (yMax - yMin) * PDF_SCALE + 8,
      }
    })
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

  // Poppler reorders combining marks in RTL runs and inserts whitespace where it pulled them out.
  // Logical order therefore ignores points and whitespace; the raster check below holds mark positions and word spacing.
  const extracted = unpointed(execFileSync('pdftotext', [pdfFile, '-'], { encoding: 'utf8' }))
  let cursor = 0
  const missing = pointedLines(html).filter((line) => {
    const expected = unpointed(line)
    const found = extracted.indexOf(expected, cursor)
    if (found < 0) return true
    cursor = found + expected.length
    return false
  })
  check('the pointed Hebrew notice extracts its source lines in logical order', missing.length === 0, missing.join(' | '))

  const prefix = path.join(work, 'hebrew-notice-pdf')
  execFileSync('pdftoppm', ['-r', String(DPI), '-singlefile', pdfFile, prefix])
  const raster = readPpm(`${prefix}.ppm`)
  const screenFile = path.join(work, 'hebrew-notice-screen.png')
  writeFileSync(screenFile, image)
  const screen = imageSize(image)
  const sameSize = raster.width === screen?.width && raster.height === screen.height
  const screenPixels = sameSize ? rgbFile(screenFile, screen.width, screen.height) : new Uint8Array()
  const difference = sameSize ? differencePixels(screenPixels, raster.pixels, raster.width, raster.height) : { mean: Number.POSITIVE_INFINITY, p99: 255 }
  const boxes = pointedLineBoxes(execFileSync('pdftotext', ['-bbox-layout', pdfFile, '-'], { encoding: 'utf8' }))
  const lines = sameSize ? boxes.map((box) => differencePixels(screenPixels, raster.pixels, raster.width, raster.height, undefined, true, box)) : []
  const scores = [difference, ...lines]
  const regionsPass = boxes.length === pointedLines(html).length && scores.every((score) => score.mean <= 2 && score.p99 <= 24)
  check(
    'the pointed Hebrew notice PDF raster and every pointed line match its page image within the effects bar',
    sameSize && regionsPass,
    `screen=${screen?.width}x${screen?.height}, pdf=${raster.width}x${raster.height}, page=${difference.mean.toFixed(2)}/${difference.p99}, lines=${lines.map((score) => `${score.mean.toFixed(2)}/${score.p99}`).join(', ')}`,
  )
}
