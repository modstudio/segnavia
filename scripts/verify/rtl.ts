// The Hebrew deck, captured from the Hebrew app: shot direction and badge
// placement, paging in reading direction, a mirrored skin, a right to left
// caption, labels in their own direction, and an isolated English value.

import '../source-guard.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Deck } from '@segnavia/format'
import { wordIndex } from '@segnavia/frame/timeline'
import { type Harness, SITE } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyRtl(h: Harness) {
  const { page, check } = h
  const deck = JSON.parse(readFileSync(path.join(SITE, 'deck-he.json'), 'utf8')) as Deck
  const list = deck.slides[1]?.content
  const form = deck.slides[2]
  if (list?.kind !== 'shot' || form?.content.kind !== 'shot' || !form.narration) throw new Error('The Hebrew deck lost its shots.')
  const ring = list.shot.annotations[0]?.ring
  const badge = list.shot.annotations[0]?.badge
  check('a shot of a right-to-left app records its direction', list.shot.dir === 'rtl', list.shot.dir)
  check(
    'its badge sits on the top-left corner, the inline end',
    Boolean(ring && badge && badge.center.x < ring.x + ring.width / 2),
    JSON.stringify({ ring, badge }),
  )

  await page.goto(h.url('he.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  check('a deck in Hebrew reads right to left without a declared dir', (await h.state(PLAYER)).direction === 'rtl')
  // Playwright locators reach through each component's shadow root.
  const x = async (selector: string) => (await page.locator(selector).first().boundingBox())?.x ?? 0
  const count = page.locator(`${PLAYER} segnavia-counter span`)
  const buttons = {
    previous: await x(`${PLAYER} segnavia-step[to="previous"] button`),
    next: await x(`${PLAYER} segnavia-step[to="next"] button`),
    first: await x(`${PLAYER} segnavia-track button[data-go="0"]`),
    second: await x(`${PLAYER} segnavia-track button[data-go="1"]`),
    label: await page.locator(`${PLAYER} segnavia-step[to="next"] button`).getAttribute('aria-label'),
    count: await count.textContent(),
    countOrder: await count.evaluate((span) => {
      const text = span.firstChild as Text
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 1)
      const first = range.getBoundingClientRect().x
      range.setStart(text, text.length - 1)
      range.setEnd(text, text.length)
      return first < range.getBoundingClientRect().x
    }),
  }
  check(
    'the skin mirrors: next sits left of previous, and the first slide is the rightmost segment',
    buttons.next < buttons.previous && buttons.first > buttons.second,
    JSON.stringify(buttons),
  )
  check("the host's own labels name the controls", buttons.label === 'השקופית הבאה', buttons.label ?? '')
  check('the slide counter reads 1 / 4 left to right inside a right-to-left player', buttons.countOrder && buttons.count === '1 / 4', buttons.count ?? '')

  await page.locator(`${PLAYER} segnavia-stage`).press('ArrowLeft')
  await h.waitFor(PLAYER, (d) => d.slide === '2')
  check('the left arrow moves forward in a right-to-left deck', (await h.state(PLAYER)).slide === '2')

  await page.locator(`${PLAYER} segnavia-stage`).press(' ')
  await h.waitFor(PLAYER, (d) => d.word !== '' && Number(d.word) >= 2)
  const caption = await page.locator(`${PLAYER} segnavia-caption p`).evaluate((line: HTMLElement) => {
    const spans = [...line.querySelectorAll('span')].map((span) => span.getBoundingClientRect().x)
    return { dir: line.dir, lang: line.lang, firstRightOfSecond: (spans[0] ?? 0) > (spans[1] ?? 0) }
  })
  check(
    'the caption reads right to left in Hebrew, first word rightmost',
    caption.dir === 'rtl' && caption.lang === 'he' && caption.firstRightOfSecond,
    JSON.stringify(caption),
  )

  await h.waitFor(PLAYER, (d, word) => d.slide === '3' && d.word !== '' && Number(d.word) >= word, {
    arg: wordIndex(form.narration ?? { words: [] }, 'יצירה'),
    timeout: 30000,
  })
  const s = await h.state(PLAYER)
  check('a cue named by a Hebrew word fires on that word', s.shown === '2', `word=${s.word} shown=${s.shown}`)
  const label = await page.locator(`${PLAYER} segnavia-stage text[direction]`).first().getAttribute('direction')
  check('an arrow label in Hebrew renders in its own direction', label === 'rtl', label ?? '')
  await h.evidence('6-rtl-cue.png')

  await h.waitFor(PLAYER, (d) => d.slide === '4', { timeout: 30000 })
  const isolated = await page.frameLocator(`${PLAYER} iframe`).locator('h1 span').getAttribute('dir')
  check('an English value filled into a Hebrew sentence is isolated', isolated === 'auto', isolated ?? '')
  await h.evidence('7-rtl-summary.png')
}
