// A host that draws its own controls: the stage and controller only, styled
// entirely by the host, with the skin never loaded.

import '../source-guard.ts'
import { STYLED_ELEMENT_NAMES } from '@segnavia/frame/styled-elements'
import type { Harness } from './harness.ts'

export async function verifyHeadless(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('headless.html'))
  await h.waitFor('segnavia-stage', (d) => d.slide === '1')
  const loaded = await page.evaluate(
    (names) => ({
      styled: names.filter((name) => customElements.get(name) !== undefined),
      shadow: (document.querySelector('segnavia-stage') as HTMLElement).shadowRoot !== null,
    }),
    STYLED_ELEMENT_NAMES,
  )
  check(
    'the headless bundle defines no styled elements, and the stage has no shadow root',
    loaded.styled.length === 0 && !loaded.shadow,
    JSON.stringify(loaded),
  )
  const look = await page.locator('segnavia-stage').evaluate((stage) => {
    const style = getComputedStyle(stage)
    return { border: style.borderTopColor, radius: style.borderTopLeftRadius }
  })
  check("the host's own CSS styles the stage, with nothing to override", look.border === 'rgb(200, 30, 30)' && look.radius === '0px', JSON.stringify(look))

  await page.click('#next')
  await h.waitFor('segnavia-stage', (d) => d.slide === '2')
  check("the host's own buttons drive the controller", (await page.textContent('#where')) === '2 of 4')
  await page.click('#play')
  await h.waitFor('segnavia-stage', (d) => d.shown === '0', { timeout: 15000 })
  const colour = await page.locator('segnavia-stage .segnavia-stage__annotations').evaluate((layer) => getComputedStyle(layer).color)
  check('annotations take the colour the host sets', colour === 'rgb(0, 128, 0)', colour)
  const marked = await page.textContent('#caption mark')
  check("the host's caption follows the spoken word", Boolean(marked), marked ?? '')
  await h.evidence('8-headless.png')
}
