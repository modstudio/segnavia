import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { verifyBookLayoutSwitching } from './book-layout-elements.ts'
import { type BookPageStyleFacts, bookPageStyleComparisons, bookPageStyleFacts } from './book-page-style.ts'
import { LARGE_BOOK_WAIT_MS, REPAGINATE_BOUND_MS, waitForLargeBook } from './book-stress-ready.ts'
import { type Harness, SITE } from './harness.ts'
import { unpointed } from './hebrew-text.ts'
import { graphemes, type PdfPageText, pageTextRelation } from './page-text-relation.ts'
import { inspectNoteViewGeometry, pageContainsNoteText } from './paginated-notes.ts'

interface ClipRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface ScreenPageText {
  text: string
  paper: { width: number; height: number }
  clips: ClipRect[]
  notes: string[]
}

interface PdfWord extends ClipRect {
  text: string
  line: number
  lineTop: number
  lineInline: number
}

interface SkippedRun {
  page: number
  text: string
}

function normalizedPageText(): ScreenPageText[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const inside = (inner: DOMRect, outer: DOMRect) => {
    const x = inner.left + inner.width / 2
    const y = inner.top + inner.height / 2
    return x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom
  }
  const visibleNodeText = (node: Text): string => {
    const parent = node.parentElement
    if (parent?.closest('[data-segnavia-galley-source]')) return ''
    const clip = parent?.closest('[data-segnavia-head],[data-segnavia-window],[data-segnavia-page-note],[data-segnavia-foot],[data-segnavia-book-page]')
    const clipRect = clip?.getBoundingClientRect()
    if (!clipRect) return ''
    let text = ''
    for (const segment of segmenter.segment(node.textContent ?? '')) {
      const range = document.createRange()
      range.setStart(node, segment.index)
      range.setEnd(node, segment.index + segment.segment.length)
      if (inside(range.getBoundingClientRect(), clipRect)) text += segment.segment
    }
    return text
  }
  const regionText = (region: Element): string => {
    let text = ''
    const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      text += visibleNodeText(node)
      node = walker.nextNode() as Text | null
    }
    return text
  }
  return Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) => {
    // Each paginated window holds a translated clone of its whole flow, so textContent includes
    // text clipped off this page. Range geometry keeps only graphemes visibly inside its clip.
    const direction = getComputedStyle(page).direction
    const regions = Array.from(page.querySelectorAll('[data-segnavia-head],[data-segnavia-window],[data-segnavia-page-note],[data-segnavia-foot]'))
    regions.sort((left, right) => {
      const leftRect = left.getBoundingClientRect()
      const rightRect = right.getBoundingClientRect()
      const block = leftRect.top - rightRect.top
      if (block !== 0) return block
      return direction === 'rtl' ? rightRect.right - leftRect.right : leftRect.left - rightRect.left
    })
    const paper = page.getBoundingClientRect()
    return {
      text: regions.map(regionText).join(''),
      paper: { width: paper.width, height: paper.height },
      clips: regions.map((region) => {
        const rect = region.getBoundingClientRect()
        return { left: rect.left - paper.left, top: rect.top - paper.top, right: rect.right - paper.left, bottom: rect.bottom - paper.top }
      }),
      notes: Array.from(page.querySelectorAll('[data-segnavia-page-note]')).map((view) => {
        const id = view.getAttribute('data-segnavia-page-note') ?? ''
        const galley = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-note="${id}"]`)
        return galley?.textContent ?? ''
      }),
    }
  })
}

function decodeXml(value: string): string {
  return value.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
}

function bboxPages(language: 'en' | 'he'): { width: number; height: number; words: PdfWord[] }[] {
  const file = path.join(SITE, `book-paginated-large-${language}.pdf`)
  const xml = execFileSync('pdftotext', ['-bbox-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return [...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map((page) => {
    let line = 0
    const words: PdfWord[] = []
    for (const match of (page[3] ?? '').matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([\s\S]*?)<\/line>/g)) {
      const lineInline = Number(match[1])
      const lineTop = Number(match[2])
      for (const word of (match[3] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g)) {
        words.push({
          left: Number(word[1]),
          top: Number(word[2]),
          right: Number(word[3]),
          bottom: Number(word[4]),
          text: decodeXml(word[5] ?? ''),
          line,
          lineTop,
          lineInline,
        })
      }
      line++
    }
    return { width: Number(page[1]), height: Number(page[2]), words }
  })
}

function pdfPageText(language: 'en' | 'he', screens: ScreenPageText[]): { pages: PdfPageText[]; dropped: number } {
  let dropped = 0
  const pages = bboxPages(language).map((page, index) => {
    const screen = screens[index]
    if (!screen) return { text: '', graphemes: [] }
    const clips = screen.clips.map((clip) => ({
      left: (clip.left / screen.paper.width) * page.width,
      top: (clip.top / screen.paper.height) * page.height,
      right: (clip.right / screen.paper.width) * page.width,
      bottom: (clip.bottom / screen.paper.height) * page.height,
    }))
    const regions = clips.map(() => new Map<number, PdfWord[]>())
    for (const word of page.words) {
      const x = (word.left + word.right) / 2
      const y = (word.top + word.bottom) / 2
      const region = clips.findIndex((clip) => x >= clip.left && x <= clip.right && y >= clip.top && y <= clip.bottom)
      if (region < 0) {
        dropped++
        continue
      }
      const line = regions[region]?.get(word.line) ?? []
      line.push(word)
      regions[region]?.set(word.line, line)
    }
    const orderedWords = regions.flatMap((region) =>
      [...region.values()]
        .sort((left, right) => (left[0]?.lineTop ?? 0) - (right[0]?.lineTop ?? 0) || (left[0]?.lineInline ?? 0) - (right[0]?.lineInline ?? 0))
        .flatMap((line) =>
          line
            .sort((left, right) => (language === 'he' ? right.right - left.right : left.left - right.left))
            .map((word) => (language === 'he' && /[\u0590-\u05ff]/.test(word.text) ? [...word.text].reverse().join('') : word.text)),
        ),
    )
    return {
      text: orderedWords.join(''),
      graphemes: orderedWords.flatMap((word, index) => graphemes(unpointed(word)).map((text) => ({ text, word: index }))),
    }
  })
  return { pages, dropped }
}

function missingNotePages(screens: ScreenPageText[], pages: PdfPageText[]): { page: number; note: string }[] {
  return screens.flatMap((screen, index) => {
    const pdfText = pages[index]?.text ?? ''
    return screen.notes.flatMap((note) => (pageContainsNoteText(pdfText, note) ? [] : [{ page: index + 1, note: unpointed(note) }]))
  })
}

async function spreadFacts(h: Harness, language: 'en' | 'he') {
  return h.page
    .frameLocator(`#book-screen-${language} iframe`)
    .locator('html')
    .evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect()
      const direction = document.documentElement.dir
      const leading = rect('[data-segnavia-spread-blank]')
      const first = rect('[data-segnavia-book-page="1"]')
      const rows = [2, 4, 6].map((even) => {
        const left = rect(`[data-segnavia-book-page="${even}"]`)
        const right = rect(`[data-segnavia-book-page="${even + 1}"]`)
        return {
          pages: `${even}/${even + 1}`,
          sameRow: left !== undefined && right !== undefined && Math.abs(left.top - right.top) < 0.5,
          readingOrder: left !== undefined && right !== undefined && (direction === 'rtl' ? left.left > right.left : left.left < right.left),
        }
      })
      const planned = document.querySelector('[data-segnavia-book-page][data-segnavia-role="blank"]') as HTMLElement | null
      const plannedRect = planned?.getBoundingClientRect()
      const paper = rect('[data-segnavia-book-page="1"]')
      return {
        direction,
        leadingRecto: leading !== undefined && first !== undefined && (direction === 'rtl' ? leading.left > first.left : leading.left < first.left),
        rows,
        plannedBlank: planned?.getAttribute('data-segnavia-book-page'),
        plannedBlankKeepsSlot:
          plannedRect !== undefined &&
          paper !== undefined &&
          Math.abs(plannedRect.width - paper.width) < 0.5 &&
          Math.abs(plannedRect.height - paper.height) < 0.5,
      }
    })
}

async function verifyNonceAuthorizedAuthorScripts(h: Harness) {
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    await h.page.locator(`#${id} iframe`).evaluate((frame: HTMLIFrameElement) => {
      const nonce = frame.srcdoc.match(/<script nonce="([^"]+)"/)?.[1]
      if (!nonce) throw new Error(`${frame.title} has no bridge nonce.`)
      frame.srcdoc = frame.srcdoc.replace('<script data-segnavia-author-script>', `<script data-segnavia-author-script nonce="${nonce}">`)
    })
    await h.page.frameLocator(`#${id} iframe`).locator('html[data-segnavia-author-script-ran]').waitFor({ timeout: LARGE_BOOK_WAIT_MS, state: 'attached' })
    const composed = await h.page.frameLocator(`#${id} iframe`).locator('html').getAttribute('data-segnavia-composed')
    h.check(`${id} author-script refusal check detects a nonce-authorized mutation`, composed !== null, String(composed))
  }
}

async function verifyLargeBookComposition(check: Harness['check'], stressPage: Page) {
  const screenTexts: Record<string, ScreenPageText[]> = {}
  for (const language of ['en', 'he'] as const) {
    const expectedPages = bboxPages(language).length
    const frame = stressPage.frameLocator(`#book-large-${language} iframe`)
    // Stable Chrome can expose an intermediate empty srcdoc composition while the large src view
    // is mounting. Wait for the page count rendered into the matching PDF, without accepting that transient.
    await waitForLargeBook(frame, expectedPages)
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`book-large-${language} composition failed: ${failure}`)
    const report = await frame.locator('html').evaluate(() => ({
      pages: document.querySelectorAll('[data-segnavia-book-page]').length,
      ms: Number(document.documentElement.getAttribute('data-segnavia-composed-ms')),
    }))
    screenTexts[language] = await frame.locator('html').evaluate(normalizedPageText)
    const geometry = await frame.locator('html').evaluate(inspectNoteViewGeometry)
    check(
      `book-large-${language} composes 300+ pages within the repagination bound`,
      report.pages >= 300 && report.pages === expectedPages && report.ms > 0 && report.ms <= REPAGINATE_BOUND_MS,
      JSON.stringify({ ...report, expectedPages, bound: REPAGINATE_BOUND_MS }),
    )
    check(
      `book-large-${language} every page note's text ink lies in its view`,
      geometry.views > 0 && geometry.outside === 0 && geometry.empty === 0,
      geometry.detail,
    )
  }
  for (const language of ['en', 'he'] as const) {
    const pdf = pdfPageText(language, screenTexts[language] ?? [])
    check(
      `book-large-${language} has the PDF's page count`,
      screenTexts[language]?.length === pdf.pages.length,
      `${screenTexts[language]?.length ?? 0}/${pdf.pages.length} pages`,
    )
    const relations = (screenTexts[language] ?? []).map((screen, index) => pageTextRelation(screen.text, pdf.pages[index] ?? { text: '', graphemes: [] }))
    const different = relations.findIndex(({ matches }) => !matches)
    const skippedRuns: SkippedRun[] = relations.flatMap(({ skipped }, index) => skipped.map((text) => ({ page: index + 1, text })))
    const longestSkippedRun = skippedRuns.reduce((longest, run) => Math.max(longest, graphemes(run.text).length), 0)
    const skippedPageCounts = new Map<number, number>()
    for (const { page } of skippedRuns) skippedPageCounts.set(page, (skippedPageCounts.get(page) ?? 0) + 1)
    const skippedPages = [...skippedPageCounts].map(([page, count]) => ({ page, count }))
    const excessPoints = relations.flatMap(({ excessPoints }, index) => (excessPoints ? [{ page: index + 1, points: excessPoints }] : []))
    const relationDetail = {
      pages: pdf.pages.length,
      droppedPdfWords: pdf.dropped,
      skippedRuns: skippedRuns.length,
      longestSkippedRun,
      skippedPages,
      skippedExamples: skippedRuns.slice(0, 3),
      excessPoints,
    }
    // The bounded-gap subsequence rule treats each bbox word as one run. It admits Poppler's clipped
    // edge-glyph fragments while rejecting missing, reordered or misplaced text and leaked words over three graphemes.
    check(
      `book-large-${language} has the PDF's text on every page`,
      different === -1,
      different === -1
        ? JSON.stringify(relationDetail)
        : JSON.stringify({
            page: different + 1,
            screen: screenTexts[language]?.[different]?.text,
            pdf: pdf.pages[different]?.text,
            relation: relations[different],
            ...relationDetail,
          }),
    )
    const screens = screenTexts[language] ?? []
    const missing = missingNotePages(screens, pdf.pages)
    const noteCount = screens.reduce((count, screen) => count + screen.notes.length, 0)
    check(
      `book-large-${language} prints each page note's whole text`,
      noteCount > 0 && missing.length === 0,
      JSON.stringify({ noteCount, missing: missing.slice(0, 5) }),
    )
  }
}

function hasPaginationRelayData(messages: Array<{ data: unknown }>): boolean {
  const paginationData = /^(?:page|pages|pageCount|spread|composedMs|compositionMs|elapsedMs)$/i
  const timingData = /(?:timing|duration|elapsed|length).*ms$/i
  return messages.some(
    ({ data }) =>
      data && typeof data === 'object' && Object.entries(data).some(([key, value]) => paginationData.test(key) || (timingData.test(key) && value !== null)),
  )
}

export async function verifyPaginatedBookElements(h: Harness, bridgeMessages: ReadonlySet<string>) {
  const { page, check } = h
  await page.goto(h.url('book-paginated.html'))
  const printStyle: Record<string, BookPageStyleFacts> = {}
  for (const language of ['en', 'he'] as const) {
    const frame = page.frameLocator(`#book-paginated-${language}`)
    await frame.locator('html[data-segnavia-composed]').waitFor({ timeout: LARGE_BOOK_WAIT_MS, state: 'attached' })
    printStyle[language] = await frame.locator('html').evaluate(bookPageStyleFacts)
  }
  await page.addInitScript(() => {
    const messages: Array<{ id: string; data: unknown }> = []
    Object.defineProperty(window, '__bookMessages', { value: messages })
    window.addEventListener(
      'ready',
      (event) => {
        if (event.target instanceof HTMLElement && event.target.tagName === 'SEGNAVIA-BOOK') event.target.setAttribute('data-segnavia-book-ready', '')
      },
      true,
    )
    window.addEventListener('message', (event) => {
      for (const id of ['book-screen-en', 'book-screen-he']) {
        const frame = document.querySelector(`#${id} iframe`) as HTMLIFrameElement | null
        if (frame?.contentWindow === event.source) messages.push({ id, data: event.data })
      }
    })
  })
  await page.goto(h.url('book-paginated-screen.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    const frame = page.frameLocator(`#${id} iframe`)
    await frame.locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]').waitFor({ timeout: LARGE_BOOK_WAIT_MS, state: 'attached' })
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`${id} composition failed: ${failure}`)
    const authorMark = await frame.locator('html').getAttribute('data-segnavia-author-script-ran')
    check(`${id} composes with author scripts refused`, authorMark === null, String(authorMark))
    await frame.locator('[data-segnavia-pages] [data-segnavia-window] img').first().waitFor({ state: 'attached' })
    await frame.locator('[data-segnavia-pages] .segnavia-contents-entry[data-level="2"]').first().waitFor({ state: 'attached' })
    const screenStyle = await frame.locator('html').evaluate(bookPageStyleFacts)
    const reference = printStyle[language]
    if (!reference) throw new Error(`${id} has no print-style reference.`)
    for (const comparison of bookPageStyleComparisons(reference, screenStyle))
      check(`${id} ${comparison.name}`, comparison.matches, JSON.stringify(comparison.detail))
  }

  await verifyBookLayoutSwitching(h)

  await page.frameLocator('#book-screen-he iframe').locator('[data-segnavia-spread-blank]').waitFor({ timeout: LARGE_BOOK_WAIT_MS })
  await page.locator('#book-screen-en').evaluate((element) => element.setAttribute('spread', ''))
  await page.frameLocator('#book-screen-en iframe').locator('[data-segnavia-spread-blank]').waitFor({ timeout: LARGE_BOOK_WAIT_MS })
  const bookMessages = await page.evaluate(() =>
    (window as unknown as { __bookMessages: Array<{ id: string; data: unknown }> }).__bookMessages.map(({ id, data }) => ({ id, data })),
  )
  const messageTypes = bookMessages.map(({ data }) => (data && typeof data === 'object' ? (data as { type?: unknown }).type : undefined))
  check(
    'paginated screen books relay only declared bridge messages and no page, spread or composition timing data',
    bookMessages.some(({ id }) => id === 'book-screen-en') &&
      bookMessages.some(({ id }) => id === 'book-screen-he') &&
      messageTypes.every((type) => typeof type === 'string' && bridgeMessages.has(type)) &&
      !hasPaginationRelayData(bookMessages),
    JSON.stringify(bookMessages),
  )
  for (const language of ['en', 'he'] as const) {
    const positions = await spreadFacts(h, language)
    check(
      `book-screen-${language} keeps recto, paired rows and planned blanks in their spread slots`,
      positions.leadingRecto && positions.rows.every((row) => row.sameRow && row.readingOrder) && positions.plannedBlankKeepsSlot,
      JSON.stringify(positions),
    )
  }
  const englishFrame = page.frameLocator('#book-screen-en iframe')
  await englishFrame.locator('[data-segnavia-spread-blank]').evaluate((element) => element.remove())
  const mutated = await spreadFacts(h, 'en')
  check('the spread check detects a removed leading empty slot', !mutated.leadingRecto, JSON.stringify(mutated))

  await verifyNonceAuthorizedAuthorScripts(h)

  // Keep the regular book checks from retaining frame state in the 300-page stress run.
  const stressContext = await page
    .context()
    .browser()
    ?.newContext({ viewport: { width: 1280, height: 816 } })
  if (!stressContext) throw new Error('The browser could not open an isolated large-book context.')
  const stressPage = await stressContext.newPage()
  await stressPage.goto(h.url('book-paginated-large.html'))
  await verifyLargeBookComposition(check, stressPage)
  await stressContext.close()
}
