import type { Harness } from './harness.ts'

export async function verifyThumbnail(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('thumbnails.html'))
  await page.waitForFunction(() => document.querySelector('#html')?.shadowRoot?.querySelector('.segnavia-stage__canvas'))
  await page.waitForFunction(() => document.querySelector('#shot')?.shadowRoot?.querySelector('img')?.complete)

  const facts = await page.locator('#html').evaluate((element) => {
    const thumbnail = element as HTMLElement
    const frame = thumbnail.shadowRoot?.querySelector('iframe')
    return {
      width: thumbnail.getBoundingClientRect().width,
      height: thumbnail.getBoundingClientRect().height,
      sandbox: frame?.getAttribute('sandbox'),
      part: thumbnail.shadowRoot?.querySelector('[part~="thumbnail"]')?.getAttribute('part'),
    }
  })
  check('a thumbnail renders an HTML slide at the host width and deck aspect ratio', facts.width === 320 && facts.height === 180, JSON.stringify(facts))
  check('a thumbnail exposes its host styling part', facts.part === 'thumbnail', String(facts.part))
  check('a thumbnail frame lets only the nonce-protected bridge run', facts.sandbox === 'allow-scripts', String(facts.sandbox))

  const background = await page
    .locator('#html iframe')
    .contentFrame()
    .locator('body')
    .evaluate((body) => getComputedStyle(body).backgroundColor)
  check('a slide script does not run inside a thumbnail', background !== 'rgb(255, 0, 0)', background)

  const hostRule = await page
    .locator('#html iframe')
    .contentFrame()
    .locator('body')
    .evaluate((body) => getComputedStyle(body).borderBlockStartWidth)
  check('a thumbnail draws its slide with the host stylesheet', hostRule === '7px', hostRule)

  const shot = await page.locator('#shot').evaluate((element) => ({
    width: (element as HTMLElement).getBoundingClientRect().width,
    image: Boolean(element.shadowRoot?.querySelector('img')),
  }))
  check('a thumbnail renders a shot slide at the host width', shot.width === 320 && shot.image, JSON.stringify(shot))

  await page.evaluate(() => scrollTo(0, 2600))
  await page.waitForFunction(() => !document.querySelector('#html')?.shadowRoot?.querySelector('.segnavia-stage__canvas'))
  const mounted = await page.locator('#html').evaluate((element) => Boolean(element.shadowRoot?.querySelector('.segnavia-stage__canvas')))
  check('a thumbnail scrolled far away holds no canvas', !mounted, String(mounted))
}
