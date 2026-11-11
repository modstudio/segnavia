// Pages: fluid and growing heights through the bridge, refused scripts,
// direction and language, block direction, and a page the host serves.

import { PAGE_DEMO_PAGES, PRINTED_PAGE_DEMO_PAGES } from '../build-page-demo.ts'
import type { Harness } from './harness.ts'

// A fixed sheet keeps its own height, so #fixed never reports a measurement.
const MEASURED_PAGES = PAGE_DEMO_PAGES.filter(({ fixture }) => typeof fixture.size !== 'object' || typeof fixture.size.height !== 'number').map(
  ({ id }) => `#${id}`,
)

async function waitForPageMeasurements(page: Harness['page']): Promise<string[]> {
  try {
    await page.waitForFunction((ids) => ids.every((id) => document.querySelector<HTMLElement>(id)?.dataset.measured !== undefined), MEASURED_PAGES, {
      timeout: 20000,
    })
    return []
  } catch {
    return page.evaluate((ids) => ids.filter((id) => document.querySelector<HTMLElement>(id)?.dataset.measured === undefined), MEASURED_PAGES)
  }
}

async function verifyPrintedPages({ page, check }: Harness): Promise<void> {
  for (const fixture of PRINTED_PAGE_DEMO_PAGES) await page.frameLocator(`#${fixture.id} iframe`).locator('html[data-segnavia-composed]').waitFor()
  // The unbounded fixture takes its height from the frame's report, which follows composition.
  await page.waitForFunction(() => document.querySelector<HTMLElement>('#printed-he')?.dataset.height !== undefined)
  const printCounts = await page.evaluate(async (fixtures) => {
    const bundle = '/segnavia.js'
    const { printPages } = (await import(bundle)) as {
      printPages: (pages: unknown[], imposition: unknown, options: { print(win: Window): void }) => Promise<void>
    }
    const imposition = { paper: 'letter', orientation: 'portrait', columns: 1, rows: 1, cell: { width: 215.9, height: 279.4 } }
    const counts = []
    for (const fixture of fixtures) {
      let printed = 0
      await printPages([fixture.fixture], imposition, {
        print(win) {
          printed = win.document.querySelectorAll('.paper').length
        },
      })
      counts.push({ id: fixture.id, printed })
    }
    return counts
  }, PRINTED_PAGE_DEMO_PAGES)
  const printedFacts: Array<{
    id: string
    screen: number
    printed: number
    dir: string | null
    paperDirections: string[]
    hostHeight: number
    frameHeight: number
    frameScrollHeight: number
    reportedHeight: number
  }> = []
  for (const fixture of PRINTED_PAGE_DEMO_PAGES) {
    const frame = page.frameLocator(`#${fixture.id} iframe`)
    const papers = frame.locator('[data-segnavia-printed-page]')
    printedFacts.push({
      id: fixture.id,
      screen: await papers.count(),
      printed: printCounts.find((count) => count.id === fixture.id)?.printed ?? 0,
      dir: await frame.locator('html').getAttribute('dir'),
      paperDirections: await papers.evaluateAll((elements) => elements.map((paper) => getComputedStyle(paper).direction)),
      hostHeight: await page.locator(`#${fixture.id}`).evaluate((element) => element.getBoundingClientRect().height),
      frameHeight: await page.locator(`#${fixture.id} iframe`).evaluate((element) => element.getBoundingClientRect().height),
      frameScrollHeight: await frame.locator('html').evaluate((element) => element.scrollHeight),
      reportedHeight: await page.locator(`#${fixture.id}`).evaluate((element) => Number((element as HTMLElement).dataset.height ?? 0)),
    })
  }
  check(
    'printed Documents show the same paper count that the print path measures',
    printedFacts.every((fact) => fact.screen > 0 && fact.screen === fact.printed),
    JSON.stringify(printedFacts),
  )
  const hebrewPapers = printedFacts.find((fact) => fact.id === 'printed-he')
  check(
    'Hebrew composed papers carry right-to-left direction',
    hebrewPapers?.dir === 'rtl' && hebrewPapers.paperDirections.length > 0 && hebrewPapers.paperDirections.every((dir) => dir === 'rtl'),
    JSON.stringify(hebrewPapers),
  )
  const bounded = printedFacts.find((fact) => fact.id === 'printed-en')
  check(
    'a bounded printed Document keeps its 500px host box and scrolls inside its frame',
    bounded?.hostHeight === 500 && bounded.frameHeight === 500 && bounded.frameScrollHeight > bounded.frameHeight,
    JSON.stringify(bounded),
  )
  const unbounded = printedFacts.find((fact) => fact.id === 'printed-he')
  check(
    "an unbounded printed Document's element height equals its reported column height",
    unbounded !== undefined && unbounded.reportedHeight > 0 && unbounded.hostHeight === unbounded.reportedHeight,
    JSON.stringify(unbounded),
  )
}

export async function verifyPages(h: Harness) {
  const { page, check } = h
  const measureCharacterPositions = (frame: string, selector: string, indexes: [number, number]): Promise<[number, number][]> =>
    page
      .frameLocator(`#${frame} iframe`)
      .locator(selector)
      .evaluateAll((elements, positions) => {
        return elements.map((element) => {
          const text = element.firstChild as Text
          const length = text.textContent?.length ?? 0
          return positions.map((position) => {
            const index = position < 0 ? length + position : position
            const range = document.createRange()
            range.setStart(text, index)
            range.setEnd(text, index + 1)
            return range.getBoundingClientRect().left
          })
        })
      }, indexes) as Promise<[number, number][]>
  await page.goto(h.url('page.html'))
  const unmeasured = await waitForPageMeasurements(page)
  check('content-height pages report their measurements before height checks', unmeasured.length === 0, `unmeasured=${unmeasured.join(',')}`)
  const heights = await page.evaluate(() => ['#fluid', '#rtl'].map((id) => Number((document.querySelector(id) as HTMLElement).dataset.height ?? 0)))
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages.join(','))
  check('a fluid page reports its content height through the bridge', (heights[0] ?? 0) > 300, `height=${heights[0]} messages=${messages}`)
  const background = await page
    .frameLocator('#fluid iframe')
    .locator('body')
    .evaluate((b) => getComputedStyle(b).backgroundColor)
  check("a page's own script did not run", background !== 'rgb(255, 0, 0)', background)
  const rtl = await page
    .frameLocator('#rtl iframe')
    .locator('html')
    .evaluate((root) => `${root.getAttribute('dir')} ${root.getAttribute('lang')}`)
  check('direction and language reach the page', rtl === 'rtl he', rtl)
  const markdownDirections = await measureCharacterPositions('markdown', 'p', [0, -1])
  const englishMarkdown = markdownDirections[0]
  const hebrewMarkdown = markdownDirections[1]
  check(
    'each mixed markdown line takes its own direction',
    englishMarkdown !== undefined && hebrewMarkdown !== undefined && englishMarkdown[1] > englishMarkdown[0] && hebrewMarkdown[1] < hebrewMarkdown[0],
    JSON.stringify(markdownDirections),
  )
  const markdownOverflow = await page
    .frameLocator('#markdown iframe')
    .locator('[data-segnavia-overflow]')
    .evaluate((box) => ({ client: box.clientWidth, scroll: box.scrollWidth, overflow: getComputedStyle(box).overflowX }))
  check(
    'a wide markdown table scrolls inside its overflow box',
    markdownOverflow.scroll > markdownOverflow.client && markdownOverflow.overflow === 'auto',
    JSON.stringify(markdownOverflow),
  )
  const diagram = await page.frameLocator('#markdown iframe').locator('[data-segnavia-diagram="mermaid"] svg').textContent()
  check('the markdown diagram draws an SVG with its Hebrew label', diagram?.includes('התחלה') === true, diagram ?? 'missing SVG')
  // An English sentence on a right to left page is still left to right: its
  // full stop renders after its last word, to the right of its first letter.
  const order = (await measureCharacterPositions('rtl', 'p', [0, -1]))[0]
  check('an English paragraph on a right-to-left page keeps its full stop on the right', order !== undefined && order[1] > order[0], JSON.stringify(order))
  const declaredOrder = (await measureCharacterPositions('rtl-own-dir', 'p', [5, -1]))[0]
  check(
    'a left-to-right paragraph opening in Hebrew keeps its full stop to the right of its English text',
    declaredOrder !== undefined && declaredOrder[1] > declaredOrder[0],
    JSON.stringify(declaredOrder),
  )
  const emptyOrder = (await measureCharacterPositions('rtl-empty-dir', 'p', [5, -1]))[0]
  check('a paragraph with an empty dir follows its first strong letter', emptyOrder !== undefined && emptyOrder[1] < emptyOrder[0], JSON.stringify(emptyOrder))
  const containerOrder = await measureCharacterPositions('rtl-div', 'div, section, article, aside, address', [0, -1])
  check(
    'English text directly in common containers on a right-to-left page keeps its full stop on the right',
    containerOrder.length === 5 && containerOrder.every((order) => order[1] > order[0]),
    JSON.stringify(containerOrder),
  )
  const fixed = await page.locator('#fixed iframe').evaluate((frame) => {
    const box = frame.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })
  check('a page with a fixed width and fixed height is shown at that size', fixed.width === 420 && fixed.height === 240, JSON.stringify(fixed))
  const printProperties = await page
    .frameLocator('#postcard iframe')
    .locator('html')
    .evaluate((root) => `${getComputedStyle(root).getPropertyValue('--segnavia-bleed')} ${getComputedStyle(root).getPropertyValue('--segnavia-safe')}`)
  check('a shown page exposes its print bleed and safe area', printProperties === '3mm 5mm', printProperties)

  await verifyPrintedPages(h)

  const linkFrames = ['#link-page-refuse iframe', '#link-page-sandboxed iframe', '#link-slide-refuse iframe', '#link-slide-sandboxed iframe']
  for (const selector of linkFrames) await page.frameLocator(selector).locator('#jump').waitFor()
  await page.evaluate(() => ((window as unknown as { __messages: string[] }).__messages.length = 0))
  for (const selector of linkFrames) {
    await page
      .frameLocator(selector)
      .locator('#jump')
      .evaluate((link: HTMLElement) => link.click())
    const facts = await page
      .frameLocator(selector)
      .locator('body')
      .evaluate(() => {
        const target = document.getElementById('far')
        const box = target?.getBoundingClientRect()
        return {
          href: location.href,
          present: Boolean(target),
          visible: Boolean(box && box.bottom > 0 && box.top < innerHeight),
          focused: document.activeElement === target,
          box: box ? { top: box.top, bottom: box.bottom, viewport: innerHeight } : null,
        }
      })
    check(
      `an in-page link stays in and scrolls its ${selector}`,
      facts.href === 'about:srcdoc' && facts.present && facts.visible && facts.focused,
      JSON.stringify(facts),
    )
  }
  const sandboxedPage = page.frameLocator('#link-page-sandboxed iframe')
  for (const linkId of ['blocked', 'blocked-delegated']) {
    await sandboxedPage.locator('body').evaluate(() => scrollTo(0, 0))
    await sandboxedPage.locator(`#${linkId}`).evaluate((link: HTMLElement) => link.click())
    const prevented = await sandboxedPage.locator('body').evaluate(() => ({ scrollY, focused: (document.activeElement as HTMLElement | null)?.id ?? '' }))
    check(`an in-page link prevented by ${linkId} is left alone`, prevented.scrollY === 0 && prevented.focused !== 'far', JSON.stringify(prevented))
  }
  for (const [linkId, targetId] of [
    ['jump-percent', 'far%'],
    ['jump-cafe', 'café'],
    ['jump-hebrew', 'פרק'],
  ] as const) {
    await sandboxedPage.locator('body').evaluate(() => scrollTo(0, 0))
    await sandboxedPage.locator(`#${linkId}`).evaluate((link: HTMLElement) => link.click())
    const facts = await sandboxedPage.locator('body').evaluate((_body, id) => {
      const target = document.getElementById(id)
      const box = target?.getBoundingClientRect()
      return {
        href: location.href,
        present: Boolean(target),
        visible: Boolean(box && box.bottom > 0 && box.top < innerHeight),
        focused: document.activeElement === target,
      }
    }, targetId)
    check(`an in-page link resolves ${linkId}`, facts.href === 'about:srcdoc' && facts.present && facts.visible && facts.focused, JSON.stringify(facts))
  }
  await sandboxedPage.locator('body').evaluate(() => scrollTo(0, 0))
  await sandboxedPage.locator('#jump-missing').evaluate((link: HTMLElement) => link.click())
  const missing = await sandboxedPage
    .locator('body')
    .evaluate(() => ({ href: location.href, present: Boolean(document.getElementById('jump-missing')), scrollY }))
  check(
    'an in-page link to a missing target keeps the frame on its document',
    missing.href === 'about:srcdoc' && missing.present && missing.scrollY === 0,
    JSON.stringify(missing),
  )
  const linkMessages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)
  check(
    'in-page links add no message kind',
    linkMessages.every((type) => ['segnavia:key', 'segnavia:height', 'segnavia:ready'].includes(type)),
    linkMessages.join(','),
  )
  await page.screenshot({ path: `${process.cwd()}/out/evidence/5-pages.png`, fullPage: true })

  await page.goto(h.url('ticket.html'))
  await page
    .waitForFunction(() => Number((document.querySelector('#ticket') as HTMLElement).dataset.height ?? 0) === 420, null, { timeout: 10000 })
    .catch(() => {})
  const ticket = await page.evaluate(() => Number((document.querySelector('#ticket') as HTMLElement).dataset.height ?? 0))
  check('a page the host serves itself reports its height through the bridge it includes', ticket === 420, `height=${ticket}`)
}
