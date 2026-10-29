import type { Harness } from './harness.ts'

interface BoundedPage extends HTMLElement {
  bounded: boolean
  page: unknown
  readSelection(): Promise<{ text: string; pageText: string }>
}

export async function verifyBoundedPage(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('page.html'))
  await page.evaluate(() => {
    document.body.style.margin = '0'
    const style = document.createElement('style')
    style.textContent = '.bounded-host{width:500px;height:240px}.bounded-host>segnavia-page{display:block;height:100%}'
    document.head.append(style)
    const mount = (id: string, scripts: 'refuse' | 'sandboxed') => {
      const element = document.createElement('segnavia-page') as BoundedPage
      element.id = id
      element.bounded = true
      element.page = {
        scripts,
        size: 'fluid',
        html: `<style>body{margin:0}.sticky{position:sticky;top:0;height:32px;background:white}.space{height:700px}</style>
          <header class="sticky">Sticky</header><a id="jump" href="#target">Jump</a><p>Selectable text</p>
          <div class="space"></div><p id="target">Target</p><div class="space"></div>`,
      }
      const host = document.createElement('div')
      host.className = 'bounded-host'
      host.append(element)
      document.body.append(host)
      return element
    }
    mount('bounded-refuse', 'refuse')
    mount('bounded-sandboxed', 'sandboxed')
  })

  for (const id of ['bounded-refuse', 'bounded-sandboxed']) await page.frameLocator(`#${id} iframe`).locator('#target').waitFor()

  const hostGeometry = await page.locator('#bounded-refuse').evaluate((element: BoundedPage) => ({
    elementHeight: element.getBoundingClientRect().height,
    inlineHeight: element.style.height,
    hostScrollY: window.scrollY,
  }))
  const frameGeometry = await page
    .frameLocator('#bounded-refuse iframe')
    .locator('body')
    .evaluate(() => {
      scrollTo(0, 400)
      return {
        frameScrollY: scrollY,
        frameScrollHeight: document.documentElement.scrollHeight,
        frameHeight: innerHeight,
        stickyTop: document.querySelector('.sticky')?.getBoundingClientRect().top ?? -1,
      }
    })
  const geometry = { ...hostGeometry, ...frameGeometry }
  check(
    'a bounded page keeps its host height and scrolls only inside its frame',
    geometry.elementHeight === 240 &&
      geometry.inlineHeight === '' &&
      geometry.frameScrollY > 0 &&
      geometry.frameScrollHeight > geometry.frameHeight &&
      geometry.hostScrollY === 0,
    JSON.stringify(geometry),
  )
  check('a sticky header sticks to the top of a scrolling bounded frame', geometry.stickyTop === 0, JSON.stringify(geometry))

  for (const id of ['bounded-refuse', 'bounded-sandboxed']) {
    const frame = page.frameLocator(`#${id} iframe`)
    await frame.locator('body').evaluate(() => scrollTo(0, 0))
    await frame.locator('#jump').evaluate((link: HTMLElement) => link.click())
    const anchor = await frame.locator('body').evaluate(() => ({
      href: location.href,
      scrollY,
      top: document.getElementById('target')?.getBoundingClientRect().top ?? -1,
      viewport: innerHeight,
    }))
    check(
      `an anchor scrolls the ${id} frame without navigating it`,
      anchor.href === 'about:srcdoc' && anchor.scrollY > 0 && anchor.top >= 0 && anchor.top < anchor.viewport,
      JSON.stringify(anchor),
    )
  }

  const selection = await page.locator('#bounded-refuse').evaluate((element: BoundedPage) => element.readSelection())
  check('a refused bounded page still answers readSelection', selection.pageText.includes('Selectable text'), JSON.stringify(selection))
}
