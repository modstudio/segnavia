// Styled components placed by a host beside its own controls, connected to a
// stage by id and themed by the host's colour scheme and accent; and the
// completely headless stage, which brings no styles at all.

import type { Harness } from './harness.ts'

export async function verifyComponents(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('components.html'))
  await h.waitFor('segnavia-stage', (d) => d.slide === '1')
  check('the styled bundle brings no full player', await page.evaluate(() => customElements.get('segnavia-player') === undefined))
  await page.waitForTimeout(200)
  check('a component finds its stage by id and reads its state', (await page.locator('segnavia-counter span').textContent()) === '1 / 4')

  await page.locator('segnavia-step[to="next"] button').click()
  await h.waitFor('segnavia-stage', (d) => d.slide === '2')
  check('a styled step drives the stage', (await h.state('segnavia-stage')).slide === '2')
  await page.locator('segnavia-play button').click()
  await h.waitFor('segnavia-stage', (d) => d.word !== '' && Number(d.word) >= 2, { timeout: 10000 })
  const active = await page.locator('segnavia-caption .active').textContent()
  check('the styled caption lights the spoken word', Boolean(active), active ?? '')
  const pause = await page.locator('segnavia-play button').getAttribute('aria-label')
  check('the play control reflects playing', pause === 'Pause', pause ?? '')

  // Off the button, so its hover colour does not stand in for the accent.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
  const theme = await page.evaluate(() => {
    const play = document.querySelector('segnavia-play')?.shadowRoot?.querySelector('button') as HTMLElement
    const counter = document.querySelector('segnavia-counter') as HTMLElement
    return { accent: getComputedStyle(play).backgroundColor, ink: getComputedStyle(counter).color }
  })
  check("the host's accent reaches the components", theme.accent === 'rgb(230, 120, 40)', theme.accent)
  check("the host's dark colour scheme reaches the components", theme.ink === 'rgb(156, 157, 166)', theme.ink)
  await h.evidence('9-components.png')

  await page.click('#mine')
  await h.waitFor('segnavia-stage', (d) => d.slide === '4')
  check("the host's own button and the styled ones drive one controller", (await page.locator('segnavia-counter span').textContent()) === '4 / 4')
  await page.locator('segnavia-track button[data-go="0"]').click()
  await h.waitFor('segnavia-stage', (d) => d.slide === '1')
  check('a track segment jumps to its slide', (await h.state('segnavia-stage')).slide === '1')

  await page.goto(h.url('unstyled.html'))
  await h.waitFor('#bare', (d) => d.slide === '1')
  const bare = await page.evaluate(() => {
    const stage = document.getElementById('bare') as HTMLElement
    return {
      base: document.querySelector('style[data-segnavia-base]') !== null,
      position: getComputedStyle(stage).position,
      aspect: getComputedStyle(stage).aspectRatio,
    }
  })
  check(
    'an unstyled stage brings no styles at all, not even geometry',
    !bare.base && bare.position === 'static' && bare.aspect === 'auto',
    JSON.stringify(bare),
  )
}
