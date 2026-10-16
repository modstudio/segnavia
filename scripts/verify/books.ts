import path from 'node:path'
import { BOUNDED_WAIT_MS, EVIDENCE, type Harness } from './harness.ts'

const EXISTING_MESSAGES = new Set(['segnavia:key', 'segnavia:height', 'segnavia:ready'])

// A jump scrolls at once, but a late layout change can land between a click and the read, so the read retries to a bound.
async function inView(h: Harness, frame: string, selector: string): Promise<boolean> {
  const read = () =>
    h.page
      .frameLocator(`${frame} iframe`)
      .locator(selector)
      .evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.bottom > 0 && box.top < innerHeight
      })
  const deadline = Date.now() + BOUNDED_WAIT_MS
  let visible = await read()
  while (!visible && Date.now() < deadline) {
    await h.page.waitForTimeout(50)
    visible = await read()
  }
  return visible
}

export async function verifyBooks(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('book.html'))
  await Promise.all(['#book-en', '#book-he'].map((book) => page.frameLocator(`${book} iframe`).locator('.segnavia-contents-list').waitFor()))
  // A click aims at a marker one letter wide, so the text must be in its final fonts before any click.
  await Promise.all(
    ['#book-en', '#book-he'].map((book) =>
      page
        .frameLocator(`${book} iframe`)
        .locator('body')
        .evaluate(() => document.fonts.ready.then(() => true)),
    ),
  )

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
      .evaluate(() => {
          const events: string[] = []
          Object.defineProperty(window, '__bookClickEvents', { value: events })
          document.addEventListener(
            'click',
            (event) => {
              const target = event.target as Element | null
              events.push(`${target?.tagName ?? 'null'}${target?.id ? `#${target.id}` : ''}[prevented=${event.defaultPrevented}]`)
              queueMicrotask(() => events.push(`after[prevented=${event.defaultPrevented}]`))
            },
            { capture: true },
          )
      })
    const trace = async (label: string) => {
      const frameState = await page
        .frameLocator(`${frame} iframe`)
        .locator('body')
        .evaluate(() => ({
          scrollY,
          href: location.href,
          active: document.activeElement ? `${document.activeElement.tagName}${document.activeElement.id ? `#${document.activeElement.id}` : ''}` : 'null',
          events: [...((window as unknown as { __bookClickEvents: string[] }).__bookClickEvents ?? [])],
        }))
      const hostActive = await page.evaluate(() =>
        document.activeElement ? `${document.activeElement.tagName}${document.activeElement.id ? `#${document.activeElement.id}` : ''}` : 'null',
      )
      console.log(`TRACE ${id} ${label} ${JSON.stringify({ frame: frameState, hostActive })}`)
    }
    await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => scrollTo(0, 0))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-top.png`) })
    await trace('before contents')
    await page.frameLocator(`${frame} iframe`).locator('.segnavia-contents-entry a').first().click()
    await trace('after contents')
    const contents = await inView(h, frame, '#segnavia-chapter-1 h1')
    const href = await page
      .frameLocator(`${frame} iframe`)
      .locator('body')
      .evaluate(() => window.location.href)
    const hostScroll = await page.evaluate(() => scrollY)
    check(`${id} contents scroll the chapter into the frame`, contents && href === 'about:srcdoc' && hostScroll === 0, JSON.stringify({ href, hostScroll }))
    await page.locator(frame).screenshot({ path: path.join(EVIDENCE, `${id}-contents.png`) })

    await trace('before footnote')
    await page.frameLocator(`${frame} iframe`).locator('#segnavia-fnref-1-1').click()
    await trace('after footnote')
    check(`${id} footnote marker brings its note into view`, await inView(h, frame, '#segnavia-fn-1-1'))
    await trace('before footnote back')
    await page.frameLocator(`${frame} iframe`).locator('#segnavia-fn-1-1 a').click()
    await trace('after footnote back')
    check(`${id} footnote back-link returns to its marker`, await inView(h, frame, '#segnavia-fnref-1-1'))

    await trace('before endnote')
    await page.frameLocator(`${frame} iframe`).locator('#segnavia-enref-1').click()
    await trace('after endnote')
    const endnote = await inView(h, frame, '#segnavia-en-1')
    const endSection = await inView(h, frame, '#segnavia-endnotes')
    check(`${id} endnote marker reaches the endnotes section`, endnote && endSection)
  }

  const direction = await page.frameLocator('#book-he iframe').locator('html').getAttribute('dir')
  check('the Hebrew continuous book root is right to left', direction === 'rtl', String(direction))
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)
  check(
    'continuous books add no host message kind',
    messages.every((kind) => EXISTING_MESSAGES.has(kind)),
    messages.join(','),
  )
}
