import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { EVIDENCE, type Harness } from './harness.ts'
import { differencePixels } from './pixel-difference.ts'
import { decodePng, type PngPixels } from './png-pixels.ts'

export const DESIGNED_PAGE_MEAN = 8
export const DESIGNED_PAGE_P99 = 48

export interface DesignedPageMatch {
  page: number
  ok: boolean
  mean: number
  p99: number
  detail: string
}

function crop(image: PngPixels, width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    const start = y * image.width * 3
    pixels.set(image.pixels.subarray(start, start + width * 3), y * width * 3)
  }
  return pixels
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

export async function compareDesignedPages(h: Harness, id: string): Promise<DesignedPageMatch[]> {
  const work = path.join(EVIDENCE, `${id}-designed`)
  mkdirSync(work, { recursive: true })
  const file = id === 'book-paginated-he' ? 'book-paginated-he.html' : 'book-paginated-en.html'
  await h.page.setViewportSize({ width: 600, height: 900 })
  await h.page.goto(h.url(file))
  await h.page.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  const pages = await h.page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-segnavia-book-page][data-segnavia-role="fixed"]')).map((node) =>
      Number(node.getAttribute('data-segnavia-book-page')),
    ),
  )
  const pdf = await h.page.pdf({ printBackground: true, width: '148mm', height: '210mm', margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  const matches: DesignedPageMatch[] = []
  for (const page of pages) {
    const screen = await screenshotPage(h.page, `[data-segnavia-book-page="${page}"]`)
    const printed = rasterPdfPage(pdf, page, work)
    const width = Math.min(screen.width, printed.width)
    const height = Math.min(screen.height, printed.height)
    const diff = differencePixels(crop(screen, width, height), crop(printed, width, height), width, height)
    matches.push({
      page,
      ok: diff.mean <= DESIGNED_PAGE_MEAN && diff.p99 <= DESIGNED_PAGE_P99,
      mean: diff.mean,
      p99: diff.p99,
      detail: `page ${page} mean ${diff.mean.toFixed(2)} p99 ${diff.p99} size ${screen.width}x${screen.height}/${printed.width}x${printed.height}`,
    })
  }
  await h.page.setViewportSize({ width: 1280, height: 816 })
  await h.page.goto(h.url('book-paginated.html'))
  return matches
}
