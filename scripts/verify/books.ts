import path from 'node:path'
import { PX_PER_MM } from '@segnavia/format'
import { EVIDENCE, type Harness } from './harness.ts'
import { compareDesignedPages, compareTemplatedPages, DESIGNED_PAGE_MEAN, DESIGNED_PAGE_P99 } from './paginated-designed.ts'
import { compareHebrewInk } from './paginated-ink.ts'
import { inspectPaginatedBook, type PaginatedReport } from './paginated-inspect.ts'

const PAGINATED_INNER_PX = 18 * PX_PER_MM

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
  await verifyWorkbooks(h)
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
      const tableDir = Array.from(document.querySelectorAll('[data-region="table"]')).map((node) => getComputedStyle(node).direction)
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
      `${id} each templated page equals its PDF page (mean <= ${DESIGNED_PAGE_MEAN}, p99 <= ${DESIGNED_PAGE_P99})`,
      pixels.length > 0 && pixels.every((item) => item.ok),
      pixels.map((item) => item.detail).join('; '),
    )
  }
  const hebrewDir = await (await paginatedFrame(h, 'book-workbook-he')).evaluate(() => document.documentElement.getAttribute('dir'))
  check('the Hebrew workbook root is right to left', hebrewDir === 'rtl', String(hebrewDir))
}
