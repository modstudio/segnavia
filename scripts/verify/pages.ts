// Pages: fluid and growing heights through the bridge, refused scripts,
// direction and language, block direction, and a page the host serves.

import type { Harness } from './harness.ts'

export async function verifyPages(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('page.html'))
  await page
    .waitForFunction(
      () => ['#fluid', '#rtl', '#rtl-div', '#fixed'].every((id) => (document.querySelector(id) as HTMLElement).dataset.measured !== undefined),
      null,
      {
        timeout: 10000,
      },
    )
    .catch(() => {})
  const heights = await page.evaluate(() => ['#fluid', '#rtl'].map((id) => Number((document.querySelector(id) as HTMLElement).dataset.height ?? 0)))
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages.join(','))
  check('a fluid page reports its content height through the bridge', (heights[0] ?? 0) > 300, `height=${heights[0]} messages=${messages}`)
  check(
    'a fixed-width page that grows takes its content height, not a viewport',
    (heights[1] ?? 0) > 40 && (heights[1] ?? 0) < 140,
    `height=${heights[1]} messages=${messages}`,
  )
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
  // An English sentence on a right to left page is still left to right: its
  // full stop renders after its last word, to the right of its first letter.
  const order = await page
    .frameLocator('#rtl iframe')
    .locator('p')
    .evaluate((p) => {
      const text = p.firstChild as Text
      const at = (index: number) => {
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + 1)
        return range.getBoundingClientRect().left
      }
      return { first: at(0), stop: at((text.textContent ?? '').length - 1) }
    })
  check('an English paragraph on a right-to-left page keeps its full stop on the right', order.stop > order.first, JSON.stringify(order))
  const containerOrder = await page
    .frameLocator('#rtl-div iframe')
    .locator('div, section, article, aside, address')
    .evaluateAll((containers) => {
      return containers.map((container) => {
        const text = container.firstChild as Text
        const at = (index: number) => {
          const range = document.createRange()
          range.setStart(text, index)
          range.setEnd(text, index + 1)
          return range.getBoundingClientRect().left
        }
        return { tag: container.tagName.toLowerCase(), first: at(0), stop: at((text.textContent ?? '').length - 1) }
      })
    })
  check(
    'English text directly in common containers on a right-to-left page keeps its full stop on the right',
    containerOrder.length === 5 && containerOrder.every((order) => order.stop > order.first),
    JSON.stringify(containerOrder),
  )
  const fixed = await page.locator('#fixed iframe').evaluate((frame) => {
    const box = frame.getBoundingClientRect()
    return { width: box.width, height: box.height }
  })
  check('a page with a fixed width and fixed height is shown at that size', fixed.width === 420 && fixed.height === 240, JSON.stringify(fixed))
  await page.screenshot({ path: `${process.cwd()}/out/evidence/5-pages.png`, fullPage: true })

  await page.goto(h.url('ticket.html'))
  await page
    .waitForFunction(() => Number((document.querySelector('#ticket') as HTMLElement).dataset.height ?? 0) === 420, null, { timeout: 10000 })
    .catch(() => {})
  const ticket = await page.evaluate(() => Number((document.querySelector('#ticket') as HTMLElement).dataset.height ?? 0))
  check('a page the host serves itself reports its height through the bridge it includes', ticket === 420, `height=${ticket}`)
}
