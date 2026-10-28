import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { EVIDENCE, type Harness } from './harness.ts'
import { differencePixels } from './pixel-difference.ts'
import { decodePng, type PngPixels } from './png-pixels.ts'

export const DESIGNED_PAGE_MEAN = 8
export const DESIGNED_PAGE_P99 = 48
export const TEMPLATED_PAGE_MEAN = 8
// The overfull lesson's reading text deliberately overlaps its table, and that overlap rasterizes differently on screen
// and in print even after alignment; a missing or misplaced region still exceeds both limits.
export const TEMPLATED_PAGE_P99 = 128
const ALIGN_PX = 2

export interface DesignedPageMatch {
  page: number
  ok: boolean
  mean: number
  p99: number
  detail: string
}

function extract(image: PngPixels, x: number, y: number, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 3)
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * image.width + x) * 3
    pixels.set(image.pixels.subarray(start, start + width * 3), row * width * 3)
  }
  return pixels
}

function alignedDifference(screen: PngPixels, printed: PngPixels, width: number, height: number): ReturnType<typeof differencePixels> {
  let best: ReturnType<typeof differencePixels> | undefined
  for (let dy = -ALIGN_PX; dy <= ALIGN_PX; dy += 1) {
    for (let dx = -ALIGN_PX; dx <= ALIGN_PX; dx += 1) {
      const overlapW = width - Math.abs(dx)
      const overlapH = height - Math.abs(dy)
      if (overlapW <= 0 || overlapH <= 0) continue
      const diff = differencePixels(
        extract(screen, Math.max(0, -dx), Math.max(0, -dy), overlapW, overlapH),
        extract(printed, Math.max(0, dx), Math.max(0, dy), overlapW, overlapH),
        overlapW,
        overlapH,
      )
      if (!best || diff.mean < best.mean || (diff.mean === best.mean && diff.p99 < best.p99)) best = diff
    }
  }
  return best ?? { mean: Number.POSITIVE_INFINITY, p99: Number.POSITIVE_INFINITY }
}

async function screenshotPage(page: Page, selector: string): Promise<PngPixels> {
  const handle = await page.$(selector)
  if (!handle) throw new Error(`The paginated book has no ${selector}.`)
  await handle.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const root = document.scrollingElement
    if (root) root.scrollTop += box.top - 8
  })
  return decodePng(new Uint8Array(await handle.screenshot({ type: 'png' })))
}

function rasterPdfPage(pdf: Uint8Array, page: number, work: string): PngPixels {
  const file = path.join(work, 'designed.pdf')
  writeFileSync(file, pdf)
  const prefix = path.join(work, `designed-${page}`)
  execFileSync('pdftoppm', ['-png', '-r', '96', '-f', String(page), '-l', String(page), '-singlefile', file, prefix])
  return decodePng(new Uint8Array(readFileSync(`${prefix}.png`)))
}

async function compareSelectedPages(h: Harness, id: string, file: string, selector: string, label: string): Promise<DesignedPageMatch[]> {
  const work = path.join(EVIDENCE, `${id}-${label}`)
  mkdirSync(work, { recursive: true })
  await h.page.setViewportSize({ width: 600, height: 900 })
  await h.page.goto(h.url(file))
  await h.page.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  const pages = await h.page.evaluate(
    (held) => Array.from(document.querySelectorAll(held)).map((node) => Number(node.getAttribute('data-segnavia-book-page'))),
    selector,
  )
  const pdf = await h.page.pdf({ printBackground: true, width: '148mm', height: '210mm', margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  const matches: DesignedPageMatch[] = []
  for (const page of pages) {
    const screen = await screenshotPage(h.page, `[data-segnavia-book-page="${page}"]`)
    const printed = rasterPdfPage(pdf, page, work)
    const width = Math.min(screen.width, printed.width)
    const height = Math.min(screen.height, printed.height)
    const diff = alignedDifference(screen, printed, width, height)
    const meanLimit = label === 'templated' ? TEMPLATED_PAGE_MEAN : DESIGNED_PAGE_MEAN
    const p99Limit = label === 'templated' ? TEMPLATED_PAGE_P99 : DESIGNED_PAGE_P99
    matches.push({
      page,
      ok: diff.mean <= meanLimit && diff.p99 <= p99Limit,
      mean: diff.mean,
      p99: diff.p99,
      detail: `page ${page} mean ${diff.mean.toFixed(2)} p99 ${diff.p99} size ${screen.width}x${screen.height}/${printed.width}x${printed.height}`,
    })
  }
  await h.page.setViewportSize({ width: 1280, height: 816 })
  return matches
}

export async function compareDesignedPages(h: Harness, id: string): Promise<DesignedPageMatch[]> {
  const file = id === 'book-paginated-he' ? 'book-paginated-he.html' : 'book-paginated-en.html'
  const matches = await compareSelectedPages(h, id, file, '[data-segnavia-book-page][data-segnavia-role="fixed"]', 'designed')
  await h.page.goto(h.url('book-paginated.html'))
  return matches
}

export async function compareTemplatedPages(h: Harness, id: string): Promise<DesignedPageMatch[]> {
  const file = id === 'book-workbook-he' ? 'book-workbook-he.html' : 'book-workbook-en.html'
  const matches = await compareSelectedPages(h, id, file, '[data-segnavia-book-page][data-segnavia-flow^="segnavia-templated-"]', 'templated')
  await h.page.goto(h.url('book-workbook.html'))
  return matches
}
