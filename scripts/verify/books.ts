import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { PX_PER_MM } from '@segnavia/format'
import { EVIDENCE, type Harness, SITE } from './harness.ts'
import { pointMultiset, unpointed } from './hebrew-text.ts'
import { inspectPaginatedBlocks } from './paginated-blocks.ts'
import {
  compareDesignedPages,
  compareTemplatedPages,
  DESIGNED_PAGE_MEAN,
  DESIGNED_PAGE_P99,
  TEMPLATED_PAGE_MEAN,
  TEMPLATED_PAGE_P99,
} from './paginated-designed.ts'
import { compareHebrewInk } from './paginated-ink.ts'
import { inspectPaginatedBook, type PaginatedReport } from './paginated-inspect.ts'

const PAGINATED_INNER_PX = 18 * PX_PER_MM
export const REPAGINATE_BOUND_MS = 20_000

const BRIDGE_MESSAGES = new Set(['segnavia:key', 'segnavia:height', 'segnavia:ready', 'segnavia:animation', 'segnavia:slot-fit'])

async function inView(h: Harness, frame: string, selector: string): Promise<boolean> {
  return h.page
    .frameLocator(`${frame} iframe`)
    .locator(selector)
    .evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
}

async function clickAnchor(h: Harness, frame: string, selector: string) {
  // Activate in the document so the check tests the link handler, not browser pointer routing into a sandboxed frame.
  await h.page
    .frameLocator(`${frame} iframe`)
    .locator(selector)
    .first()
    .evaluate((element: HTMLAnchorElement) => element.click())
}

export async function verifyBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book.html'))
  await Promise.all(['#book-en', '#book-he'].map((book) => page.frameLocator(`${book} iframe`).locator('.segnavia-contents-list').waitFor()))

  const geometry = await page.evaluate(() => ({
    heights: ['book-en', 'book-he'].map((id) => document.getElementById(id)?.getBoundingClientRect().height),
    hostScroll: scrollY,
    hostHeight: document.documentElement.scrollHeight,
    viewport: innerHeight,
  }))
  check(
    'continuous books stay 400px tall without scrolling the host page',
    geometry.heights.every((height) => height === 400) && geometry.hostScroll === 0 && geometry.hostHeight === geometry.viewport,
    JSON.stringify(geometry),
  )

  for (const id of ['book-en', 'book-he'] as const) {
    const frame = `#${id}`
    await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => scrollTo(0, 0))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-top.png`) })
    await clickAnchor(h, frame, '.segnavia-contents-entry a')
    const contents = await inView(h, frame, '#segnavia-chapter-1 h1')
    const href = await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => window.location.href)
    const hostScroll = await page.evaluate(() => scrollY)
    check(`${id} contents scroll the chapter into the frame`, contents && href === 'about:srcdoc' && hostScroll === 0, JSON.stringify({ href, hostScroll }))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-contents.png`) })

    await clickAnchor(h, frame, '#segnavia-fnref-1-1')
    check(`${id} footnote marker brings its note into view`, await inView(h, frame, '#segnavia-fn-1-1'))
    await clickAnchor(h, frame, '#segnavia-fn-1-1 a')
    check(`${id} footnote back-link returns to its marker`, await inView(h, frame, '#segnavia-fnref-1-1'))

    await clickAnchor(h, frame, '#segnavia-enref-1')
    const endnote = await inView(h, frame, '#segnavia-en-1')
    const endSection = await inView(h, frame, '#segnavia-endnotes')
    check(`${id} endnote marker reaches the endnotes section`, endnote && endSection)
  }

  const direction = await page.frameLocator('#book-he iframe').locator('html').getAttribute('dir')
  check('the Hebrew continuous book root is right to left', direction === 'rtl', String(direction))
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)
  check(
    'continuous books use only declared bridge message kinds',
    messages.every((kind) => BRIDGE_MESSAGES.has(kind)),
    messages.join(','),
  )

  await verifyPaginatedBooks(h)
  await verifyPaginatedBookElements(h)
  await verifyWorkbooks(h)
}

function normalizedPageText() {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const inside = (inner: DOMRect, outer: DOMRect) => {
    const x = inner.left + inner.width / 2
    const y = inner.top + inner.height / 2
    return x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom
  }
  const visibleNodeText = (node: Text): string => {
    const parent = node.parentElement
    if (parent?.closest('[data-segnavia-galley-source]')) return ''
    const clip = parent?.closest('[data-segnavia-page-note],[data-segnavia-window],[data-segnavia-book-page]')
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
    return regions.map(regionText).join('')
  })
}

function pdfPageText(language: 'en' | 'he'): string[] {
  const pages = execFileSync('pdftotext', [path.join(SITE, `book-paginated-large-${language}.pdf`), '-'], { encoding: 'utf8' }).split('\f')
  if (unpointed(pages.at(-1) ?? '') === '') pages.pop()
  return pages
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

async function verifyPaginatedBookElements(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book-paginated-screen.html'))
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    const frame = page.frameLocator(`#${id} iframe`)
    await frame.locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]').waitFor({ timeout: REPAGINATE_BOUND_MS, state: 'attached' })
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`${id} composition failed: ${failure}`)
  }

  await page.frameLocator('#book-screen-he iframe').locator('[data-segnavia-spread-blank]').waitFor({ timeout: REPAGINATE_BOUND_MS })
  await page.locator('#book-screen-en').evaluate((element) => element.setAttribute('spread', ''))
  await page.frameLocator('#book-screen-en iframe').locator('[data-segnavia-spread-blank]').waitFor({ timeout: REPAGINATE_BOUND_MS })
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

  await page.goto(h.url('book-paginated-large.html'))
  const screenTexts: Record<string, string[]> = {}
  for (const language of ['en', 'he'] as const) {
    const frame = page.frameLocator(`#book-large-${language} iframe`)
    await frame.locator('html[data-segnavia-composed],html[data-segnavia-compose-failure]').waitFor({ timeout: REPAGINATE_BOUND_MS, state: 'attached' })
    const failure = await frame.locator('html').getAttribute('data-segnavia-compose-failure')
    if (failure) throw new Error(`book-large-${language} composition failed: ${failure}`)
    const report = await frame.locator('html').evaluate(() => ({
      pages: document.querySelectorAll('[data-segnavia-book-page]').length,
      ms: Number(document.documentElement.getAttribute('data-segnavia-composed-ms')),
    }))
    screenTexts[language] = await frame.locator('html').evaluate(normalizedPageText)
    check(
      `book-large-${language} composes 300+ pages within the provisional bound`,
      report.pages >= 300 && report.ms > 0 && report.ms <= REPAGINATE_BOUND_MS,
      JSON.stringify({ ...report, bound: REPAGINATE_BOUND_MS }),
    )
  }
  for (const language of ['en', 'he'] as const) {
    const pdfTexts = pdfPageText(language)
    check(
      `book-large-${language} has the PDF's page count`,
      screenTexts[language]?.length === pdfTexts.length,
      `${screenTexts[language]?.length ?? 0}/${pdfTexts.length} pages`,
    )
    const different =
      screenTexts[language]?.findIndex(
        (text, index) => unpointed(text) !== unpointed(pdfTexts[index] ?? '') || pointMultiset(text) !== pointMultiset(pdfTexts[index] ?? ''),
      ) ?? -1
    check(
      `book-large-${language} has the PDF's text on every page`,
      different === -1,
      different === -1
        ? `${pdfTexts.length} pages`
        : JSON.stringify({ page: different + 1, screen: screenTexts[language]?.[different], pdf: pdfTexts[different] }),
    )
  }
}

async function paginatedFrame(h: Harness, id: string) {
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The paginated book frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

async function inspectPaginated(h: Harness, id: string): Promise<PaginatedReport> {
  const frame = await paginatedFrame(h, id)
  return frame.evaluate(inspectPaginatedBook)
}

async function verifyPaginatedBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book-paginated.html'))
  for (const id of ['book-paginated-en', 'book-paginated-he'] as const) {
    const frame = await paginatedFrame(h, id)
    const report = await inspectPaginated(h, id)
    check(`${id} composed without a planner refusal`, !report.failure && report.pages > 1, report.failure ?? `${report.pages} pages`)
    check(
      `${id} every galley line is on exactly one window`,
      report.lost === 0 && report.repeated === 0,
      JSON.stringify({ lost: report.lost, repeated: report.repeated }),
    )
    check(
      `${id} each block appears only in the windows its extent intersects`,
      report.blocks.extra === 0 && report.blocks.missing === 0 && report.blocks.shown > 0,
      JSON.stringify(report.blocks),
    )
    check(
      `${id} each placed line sits at its galley position minus the window start`,
      report.lines.shifted === 0 && report.lines.checked > 0,
      JSON.stringify(report.lines),
    )
    check(
      `${id} every footnote is on its ref's page or continues from it`,
      report.notes.length > 0 && report.notes.every((note) => note.ok),
      JSON.stringify(report.notes),
    )
    check(
      `${id} column windows keep the galley's lines, balanced to one line`,
      report.columns.lost === 0 && report.columns.repeated === 0 && report.columns.balanced,
      JSON.stringify(report.columns),
    )
    check(
      `${id} blanks have no furniture and openers have no running head`,
      report.furniture.blanksHaveNone && report.furniture.openersHaveNoHead && report.furniture.bodyHasFolio,
      JSON.stringify(report.furniture),
    )
    check(`${id} contents page numbers equal the chapters' first pages`, report.contents.matches, report.contents.detail)
    check(
      `${id} text area sits the inner margin from the spine`,
      report.spine.length > 0 && report.spine.every((item) => Math.abs(item.distance - PAGINATED_INNER_PX) < 0.5),
      JSON.stringify(report.spine),
    )
    check(`${id} ids are unique in the composed document`, report.ids.unique, JSON.stringify(report.ids))
    check(`${id} window edges sit on line-box midpoints`, report.clip.midpoint, JSON.stringify(report.clip))
    if (id === 'book-paginated-he') {
      const ink = await compareHebrewInk(h, frame)
      check(`${id} no niqqud or taamim ink is lost at any window edge`, ink.ok, ink.detail)
    }
    check(
      `${id} running heads take the first mark and carry onto a page with none`,
      report.runningHead.fromMark && report.runningHead.carried,
      report.runningHead.detail,
    )

    await frame.locator('[data-segnavia-pages] a[href="#segnavia-chapter-1"]').evaluate((element: HTMLAnchorElement) => element.click())
    const landed = await frame.evaluate(() => {
      const target = document.getElementById('segnavia-chapter-1')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    check(`${id} contents links land on the chapter's first page`, landed)

    const designed = report.designed
    check(
      `${id} designed spread opens verso and faces its recto`,
      designed.spreadVerso && designed.spreadFaces,
      JSON.stringify({ spreadVerso: designed.spreadVerso, spreadFaces: designed.spreadFaces }),
    )
    check(
      `${id} designed spread has no parent furniture and the plate shows its section parent`,
      designed.spreadHasNoFurniture && designed.leafHasFurniture,
      JSON.stringify({ spreadHasNoFurniture: designed.spreadHasNoFurniture, leafHasFurniture: designed.leafHasFurniture }),
    )
    await checkPaginatedBlocks(h, frame, id)
    check(`${id} contents page numbers equal the designed section's first page and its headings' pages`, designed.contents.matches, designed.contents.detail)
    await frame.locator('[data-segnavia-pages] a[href="#spread-open"]').evaluate((element: HTMLAnchorElement) => element.click())
    const spreadLanded = await frame.evaluate(() => {
      const target = document.getElementById('spread-open')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    await frame.locator('[data-segnavia-pages] a[href="#spread-recto"]').evaluate((element: HTMLAnchorElement) => element.click())
    const rectoLanded = await frame.evaluate(() => {
      const target = document.getElementById('spread-recto')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    await frame.locator('[data-segnavia-pages] a[href="#plate"]').evaluate((element: HTMLAnchorElement) => element.click())
    const plateLanded = await frame.evaluate(() => {
      const target = document.getElementById('plate')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    check(`${id} contents links land on the designed pages`, spreadLanded && rectoLanded && plateLanded)

    const pixels = await compareDesignedPages(h, id)
    check(
      `${id} each designed page equals its PDF page (mean <= ${DESIGNED_PAGE_MEAN}, p99 <= ${DESIGNED_PAGE_P99})`,
      pixels.length > 0 && pixels.every((item) => item.ok),
      pixels.map((item) => item.detail).join('; '),
    )
    await page.locator(`#${id}`).screenshot({ path: path.join(EVIDENCE, `${id}.png`) })
  }
  const hebrewDir = await (await paginatedFrame(h, 'book-paginated-he')).evaluate(() => document.documentElement.getAttribute('dir'))
  check('the Hebrew paginated book root is right to left', hebrewDir === 'rtl', String(hebrewDir))
  await checkOversizeBooks(h)
}

async function checkPaginatedBlocks(h: Harness, frame: Awaited<ReturnType<typeof paginatedFrame>>, id: string) {
  const blocks = await frame.evaluate(inspectPaginatedBlocks)
  h.check(`${id} each chapter's endnotes follow its text and come before the next chapter's opener or blank`, blocks.endnotes.ok, blocks.endnotes.detail)
  h.check(`${id} a tall image is scaled onto one page`, blocks.image.ok, blocks.image.detail)
  h.check(`${id} a long table continues with its header row repeated and no row lost or repeated`, blocks.table.ok, blocks.table.detail)
  if (id === 'book-paginated-he') h.check(`${id} the long table and endnotes are right to left`, blocks.direction.ok, blocks.direction.detail)
}

async function checkOversizeBooks(h: Harness) {
  const { page, check } = h
  for (const id of ['book-paginated-oversize-en', 'book-paginated-oversize-he'] as const) {
    await page.goto(h.url(`${id}.html`))
    await page.waitForFunction(
      () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
      undefined,
      { timeout: 20_000 },
    )
    const failure = await page.evaluate(() => document.documentElement.getAttribute('data-segnavia-compose-failure'))
    check(
      `${id} refuses an oversized pre by tag, chapter and position`,
      Boolean(failure?.includes('The pre at chapter 1 block 1') && failure.includes('clear this refusal')),
      failure ?? 'composed',
    )
  }
  await page.goto(h.url('book-paginated.html'))
}

async function verifyWorkbooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book-workbook.html'))
  for (const id of ['book-workbook-en', 'book-workbook-he'] as const) {
    const frame = await paginatedFrame(h, id)
    const report = await frame.evaluate(() => {
      const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page][data-segnavia-flow^="segnavia-templated-"]'))
      const templates = pages.map((paper) => paper.querySelector('[data-template]')?.getAttribute('data-template') ?? '')
      const overflow = Array.from(document.querySelectorAll('[data-segnavia-region-overflow]')).map((node) =>
        node.getAttribute('data-segnavia-region-overflow'),
      )
      const school = document.body.textContent ?? ''
      const tableDir = Array.from(document.querySelectorAll('[data-segnavia-book-page] [data-region="table"]')).map((node) => getComputedStyle(node).direction)
      const contents = Array.from(document.querySelectorAll('.segnavia-contents-page[data-target]')).map((node) => {
        const target = node.getAttribute('data-target') ?? ''
        const paper = document.getElementById(target)?.closest('[data-segnavia-book-page]')
        return { id: target, text: node.textContent?.trim() ?? '', folio: paper?.getAttribute('data-segnavia-folio') ?? '' }
      })
      return {
        failure: document.documentElement.getAttribute('data-segnavia-compose-failure'),
        pages: pages.length,
        templates,
        overflow,
        school,
        tableDir,
        contents,
        bodyFolio: pages.every((paper) => Boolean(paper.querySelector('.segnavia-folio')?.textContent?.trim())),
        dir: document.documentElement.getAttribute('dir'),
      }
    })
    check(`${id} composed without a planner refusal`, !report.failure && report.pages === 3, report.failure ?? `${report.pages} pages`)
    check(
      `${id} one lesson page names its own template`,
      report.templates.includes('lesson') && report.templates.includes('lesson-alt'),
      report.templates.join(','),
    )
    check(
      `${id} an overfull reading-text region is marked by page and name`,
      report.overflow.some((mark) => mark?.includes(':reading-text:')),
      JSON.stringify(report.overflow),
    )
    check(`${id} templated pages carry folios`, report.bodyFolio)
    const lessons = report.contents.filter((entry) => entry.id.startsWith('lesson-') || entry.id === 'segnavia-templated-1')
    check(
      `${id} contents lists every lesson with its page number`,
      lessons.length >= 4 && lessons.every((entry) => entry.text !== '' && entry.text === entry.folio),
      JSON.stringify(lessons),
    )
    const expectedSchool = id === 'book-workbook-he' ? 'בית ספר הירדן' : 'Jordan School'
    check(`${id} host school name shows on the copyright page`, report.school.includes(expectedSchool), expectedSchool)
    check(`${id} table regions are right to left`, report.tableDir.length > 0 && report.tableDir.every((dir) => dir === 'rtl'), report.tableDir.join(','))

    await frame.locator('[data-segnavia-pages] a[href="#lesson-1"]').evaluate((element: HTMLAnchorElement) => element.click())
    const landed = await frame.evaluate(() => {
      const target = document.getElementById('lesson-1')
      if (!target) return false
      const box = target.getBoundingClientRect()
      return box.bottom > 0 && box.top < innerHeight
    })
    check(`${id} contents links land on the lesson pages`, landed)

    const pixels = await compareTemplatedPages(h, id)
    check(
      `${id} each templated page equals its PDF page (mean <= ${TEMPLATED_PAGE_MEAN}, p99 <= ${TEMPLATED_PAGE_P99})`,
      pixels.length > 0 && pixels.every((item) => item.ok),
      pixels.map((item) => item.detail).join('; '),
    )
  }
  const hebrewDir = await (await paginatedFrame(h, 'book-workbook-he')).evaluate(() => document.documentElement.getAttribute('dir'))
  check('the Hebrew workbook root is right to left', hebrewDir === 'rtl', String(hebrewDir))
}
