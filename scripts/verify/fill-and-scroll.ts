import type { Harness } from './harness.ts'

interface FillPage extends HTMLElement {
  fill: boolean
  page: unknown
  readSelection(): Promise<{ text: string; pageText: string }>
}

export async function verifyFillAndScroll(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('page.html'))
  await page.evaluate(() => {
    document.body.style.margin = '0'
    const style = document.createElement('style')
    style.textContent = '.fill-host{width:500px;height:240px}.fill-host>segnavia-page{display:block;height:100%}'
    document.head.append(style)
    const mount = (id: string, scripts: 'refuse' | 'sandboxed') => {
      const element = document.createElement('segnavia-page') as FillPage
      element.id = id
      element.fill = true
      element.page = {
        scripts,
        size: 'fluid',
        html: `<style>body{margin:0}.sticky{position:sticky;top:0;height:32px;background:white}.space{height:700px}</style>
          <header class="sticky">Sticky</header><a id="jump" href="#target">Jump</a><p>Selectable text</p>
          <div class="space"></div><p id="target">Target</p><div class="space"></div>`,
      }
      const host = document.createElement('div')
      host.className = 'fill-host'
      host.append(element)
      document.body.append(host)
      return element
    }
    mount('fill-refuse', 'refuse')
    mount('fill-sandboxed', 'sandboxed')
  })

  for (const id of ['fill-refuse', 'fill-sandboxed']) await page.frameLocator(`#${id} iframe`).locator('#target').waitFor()

  const hostGeometry = await page.locator('#fill-refuse').evaluate((element: FillPage) => ({
    elementHeight: element.getBoundingClientRect().height,
    inlineHeight: element.style.height,
    hostScrollY: window.scrollY,
  }))
  const frameGeometry = await page
    .frameLocator('#fill-refuse iframe')
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
    'a fill page keeps its host height and scrolls only inside its frame',
    geometry.elementHeight === 240 &&
      geometry.inlineHeight === '' &&
      geometry.frameScrollY > 0 &&
      geometry.frameScrollHeight > geometry.frameHeight &&
      geometry.hostScrollY === 0,
    JSON.stringify(geometry),
  )
  check('a sticky header sticks to the top of a scrolling fill frame', geometry.stickyTop === 0, JSON.stringify(geometry))

  for (const id of ['fill-refuse', 'fill-sandboxed']) {
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

  const selection = await page.locator('#fill-refuse').evaluate((element: FillPage) => element.readSelection())
  check('a refused fill page still answers readSelection', selection.pageText.includes('Selectable text'), JSON.stringify(selection))
}
