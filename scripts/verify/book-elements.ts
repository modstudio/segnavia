import path from 'node:path'
import type { Page } from 'playwright-core'
import { verifyComposeFailure } from './book-compose-failure.ts'
import { verifyHiddenBookElements } from './book-hidden-elements.ts'
import { verifyBookLayoutSwitching, verifyNonceAuthorizedAuthorScripts } from './book-layout-elements.ts'
import { verifyBookLineNumbers } from './book-line-numbers.ts'
import { type BookPageStyleFacts, bookPageStyleComparisons, bookPageStyleFacts } from './book-page-style.ts'
import { verifyBookSideNotes } from './book-side-notes.ts'
import { collectedComposeProgress, installComposeProgressCollector, LARGE_BOOK_WAIT_MS, REPAGINATE_BOUND_MS, waitForLargeBook } from './book-stress-ready.ts'
import { pagesText } from './book-text.ts'
import { type Harness, SITE } from './harness.ts'
import { unpointed } from './hebrew-text.ts'
import { inspectNoteViewGeometry, pageContainsNoteText } from './paginated-notes.ts'

interface ScreenPageNotes {
  notes: string[]
}

function screenPageNotes(): ScreenPageNotes[] {
  return Array.from(document.querySelectorAll('[data-segnavia-book-page]')).map((page) => {
    return {
      notes: Array.from(page.querySelectorAll('[data-segnavia-page-note]')).map((view) => {
        const id = view.getAttribute('data-segnavia-page-note') ?? ''
        const galley = document.querySelector(`[data-segnavia-galley-source] [data-segnavia-note="${id}"]`)
        return galley?.textContent ?? ''
      }),
    }
  })
}

function missingNotePages(screens: ScreenPageNotes[], pages: string[]): { page: number; note: string }[] {
  return screens.flatMap((screen, index) => {
    const pdfText = pages[index] ?? ''
    return screen.notes.flatMap((note) => (pageContainsNoteText(pdfText, note) ? [] : [{ page: index + 1, note: unpointed(note) }]))
  })
}

async function spreadFacts(h: Harness, language: 'en' | 'he') {
  return h.page
    .frameLocator(`#book-screen-${language} iframe[data-segnavia-book-layout="pages"]`)
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

async function verifyLargeBookComposition(check: Harness['check'], stressPage: Page) {
  const screenPages: Record<'en' | 'he', ScreenPageNotes[]> = { en: [], he: [] }
  const pdfPages: Record<'en' | 'he', string[]> = { en: [], he: [] }
  for (const language of ['en', 'he'] as const) {
    const pages = pagesText(path.join(SITE, `book-paginated-large-${language}.pdf`))
    pdfPages[language] = pages
    const expectedPages = pages.length
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
    const progress = await collectedComposeProgress(stressPage, `book-large-${language}`)
    const progressPages = progress.map((entry) => entry.pages)
    check(
      `book-large-${language} reports monotonic compose progress through its final page`,
      progress.length > 0 &&
        progress.every((entry) => entry.total === expectedPages) &&
        progressPages.every((pages, index) => index === 0 || pages > (progressPages[index - 1] ?? 0)) &&
        progressPages.at(-1) === expectedPages,
      JSON.stringify({ expectedPages, progress }),
    )
    screenPages[language] = await frame.locator('html').evaluate(screenPageNotes)
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
    const pdf = pdfPages[language]
    check(`book-large-${language} has the PDF's page count`, screenPages[language].length === pdf.length, `${screenPages[language].length}/${pdf.length} pages`)
    const screens = screenPages[language]
    const missing = missingNotePages(screens, pdf)
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
      data &&
      typeof data === 'object' &&
      (data as { type?: unknown }).type !== 'segnavia:compose-progress' &&
      Object.entries(data).some(([key, value]) => paginationData.test(key) || (timingData.test(key) && value !== null)),
  )
}

export async function verifyPaginatedBookElements(h: Harness, bridgeMessages: ReadonlySet<string>) {
  const { page, check } = h
  await verifyHiddenBookElements(h)
  await verifyBookLineNumbers(h)
  await verifyBookSideNotes(h)
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
        const frames = document.querySelectorAll<HTMLIFrameElement>(`#${id} iframe`)
        if ([...frames].some((frame) => frame.contentWindow === event.source)) messages.push({ id, data: event.data })
      }
    })
  })
  await page.goto(h.url('book-paginated-screen.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    const frame = page.frameLocator(`#${id} iframe[data-segnavia-book-layout="pages"]`)
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

  await page
    .frameLocator('#book-screen-he iframe[data-segnavia-book-layout="pages"]')
    .locator('[data-segnavia-spread-blank]')
    .waitFor({ timeout: LARGE_BOOK_WAIT_MS })
  await page.locator('#book-screen-en').evaluate((element) => element.setAttribute('spread', ''))
  await page
    .frameLocator('#book-screen-en iframe[data-segnavia-book-layout="pages"]')
    .locator('[data-segnavia-spread-blank]')
    .waitFor({ timeout: LARGE_BOOK_WAIT_MS })
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
  const englishFrame = page.frameLocator('#book-screen-en iframe[data-segnavia-book-layout="pages"]')
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
  await installComposeProgressCollector(stressPage)
  await stressPage.goto(h.url('book-paginated-large.html'))
  await verifyLargeBookComposition(check, stressPage)
  await stressContext.close()
  await verifyComposeFailure(h)
}
