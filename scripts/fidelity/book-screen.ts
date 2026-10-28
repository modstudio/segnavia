import { type Book, PX_PER_MM } from '@segnavia/format'
import { BOOK_COMPOSED_ATTRIBUTE, BOOK_FAILURE_ATTRIBUTE, bookViewDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { bookView } from '@segnavia/html'
import { type Browser, chromium, type Page as Tab } from 'playwright-core'
import { SCALE } from './config.ts'
import type { ComputedStyleFacts } from './regions.ts'
import type { Box } from './types.ts'

const OFFLINE_ARGS = ['--proxy-server=socks5://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp']

export interface BookPaperCapture {
  index: number
  bytes: Uint8Array
  regions: Array<{ name: string; box: Box }>
  blendedFacts: ComputedStyleFacts[]
}

export async function openBookBrowser(executablePath: string): Promise<Browser> {
  return chromium.launch({ executablePath, args: OFFLINE_ARGS })
}

function paperCssSize(book: Book): { width: number; height: number } {
  const view = bookView(book)
  if (!view.pagination) throw new Error('A paginated book view needs pagination; supply a paginated Book to clear this refusal.')
  return { width: view.pagination.paper.width * PX_PER_MM, height: view.pagination.paper.height * PX_PER_MM }
}

async function awaitComposed(tab: Tab): Promise<void> {
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: BOOK_COMPOSED_ATTRIBUTE,
    failed: BOOK_FAILURE_ATTRIBUTE,
  })
  const failure = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), BOOK_FAILURE_ATTRIBUTE)
  if (failure) throw new Error(failure)
}

export async function shiftTextWindowByOneLine(tab: Tab, pageIndex: number): Promise<void> {
  await tab.evaluate((index) => {
    const paper = document.querySelector(`[data-segnavia-book-page="${index}"]`)
    if (!paper) throw new Error(`The fault control has no paper ${index}.`)
    const windows = [...paper.querySelectorAll<HTMLElement>('[data-segnavia-window]')]
    const sample = windows[0]?.querySelector('p, h1, li') ?? windows[0]
    if (!sample) throw new Error(`Paper ${index} has no text window to shift.`)
    const style = getComputedStyle(sample)
    const rects = [...sample.getClientRects()]
    const fromLines = rects[0] && rects[1] ? rects[1].top - rects[0].top : 0
    const pitch = [Number.parseFloat(style.lineHeight), fromLines, rects[0]?.height ?? 0, Number.parseFloat(style.fontSize)].find((value) => value > 0)
    if (!pitch) throw new Error(`Paper ${index} has no measurable line pitch.`)
    for (const view of windows) view.style.insetBlockStart = `${Number.parseFloat(view.style.insetBlockStart || '0') + pitch}px`
  }, pageIndex)
}

async function paperRegions(tab: Tab, index: number, origin: { x: number; y: number }): Promise<Array<{ name: string; box: Box }>> {
  return tab.locator(`[data-segnavia-book-page="${index}"] [data-fidelity]`).evaluateAll((elements, held) => {
    return elements.map((element) => {
      const box = element.getBoundingClientRect()
      return {
        name: element.getAttribute('data-fidelity') ?? 'unnamed',
        box: { x: box.x - held.x, y: box.y - held.y, width: box.width, height: box.height },
      }
    })
  }, origin)
}

async function paperBlendedFacts(tab: Tab, index: number, origin: { x: number; y: number }): Promise<ComputedStyleFacts[]> {
  return tab.locator(`[data-segnavia-book-page="${index}"] *`).evaluateAll((elements, held) => {
    return elements.map((element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        box: { x: box.x - held.x, y: box.y - held.y, width: box.width, height: box.height },
        backgroundImage: style.backgroundImage,
        borderImage: style.borderImage,
        opacity: style.opacity,
        mixBlendMode: style.mixBlendMode,
        filter: style.filter,
        backdropFilter: style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter'),
        boxShadow: style.boxShadow,
        textShadow: style.textShadow,
        mask: style.getPropertyValue('mask') || style.getPropertyValue('-webkit-mask'),
        maskImage: style.getPropertyValue('mask-image') || style.getPropertyValue('-webkit-mask-image'),
      }
    })
  }, origin)
}

export async function captureBookPapers(browser: Browser, book: Book, css: string): Promise<BookPaperCapture[]> {
  const view = bookView(book)
  if (!view.pagination) throw new Error('A paginated book view needs pagination; supply a paginated Book to clear this refusal.')
  const paper = paperCssSize(book)
  const html = bookViewDocument(view, { nonce: newNonce(), css, screen: { spread: false }, printBackground: true })
  const context = await browser.newContext({
    viewport: { width: Math.ceil(paper.width) + 96, height: Math.ceil(paper.height) + 96 },
    deviceScaleFactor: SCALE,
    javaScriptEnabled: true,
    offline: true,
  })
  try {
    await context.route('**/*', (route) => (route.request().url().startsWith('data:') ? route.continue() : route.abort('blockedbyclient')))
    await context.routeWebSocket('**/*', (socket) => socket.close())
    const tab = await context.newPage()
    await tab.setContent(html, { waitUntil: 'load' })
    await awaitComposed(tab)
    const papers = await tab.evaluate(
      ({ expectedWidth, expectedHeight }) =>
        [...document.querySelectorAll<HTMLElement>('[data-segnavia-book-page]')].map((node) => {
          const box = node.getBoundingClientRect()
          return {
            index: Number(node.getAttribute('data-segnavia-book-page')),
            width: box.width,
            height: box.height,
            expectedWidth,
            expectedHeight,
          }
        }),
      { expectedWidth: paper.width, expectedHeight: paper.height },
    )
    if (!papers.length) throw new Error('The paginated view produced no papers.')
    for (const held of papers) {
      if (Math.abs(held.width - held.expectedWidth) > 1e-3 || Math.abs(held.height - held.expectedHeight) > 1e-3) {
        throw new Error(`Paper ${held.index} rendered at ${held.width}×${held.height} CSS px; expected ${held.expectedWidth}×${held.expectedHeight} CSS px.`)
      }
    }
    const rasterWidth = Math.round(paper.width * SCALE)
    const rasterHeight = Math.round(paper.height * SCALE)
    const captures: BookPaperCapture[] = []
    for (const held of papers) {
      const locator = tab.locator(`[data-segnavia-book-page="${held.index}"]`)
      const origin = await locator.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y }
      })
      const bytes = new Uint8Array(await locator.screenshot({ type: 'png' }))
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const width = view.getUint32(16)
      const height = view.getUint32(20)
      if (width !== rasterWidth || height !== rasterHeight) {
        throw new Error(
          `Paper ${held.index} screenshot is ${width}×${height} device px; expected ${rasterWidth}×${rasterHeight} (${held.expectedWidth}×${held.expectedHeight} CSS px at scale ${SCALE}).`,
        )
      }
      captures.push({
        index: held.index,
        bytes,
        regions: await paperRegions(tab, held.index, origin),
        blendedFacts: await paperBlendedFacts(tab, held.index, origin),
      })
    }
    return captures
  } finally {
    await context.close().catch(() => {})
  }
}
