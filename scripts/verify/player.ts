// The skin playing the English deck: paging, play mode, cues, the frame's
// policy and bridge, shot references, notes, scripts, prefetch and print.

import '../source-guard.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Deck } from '@segnavia/format'
import { wordIndex } from '@segnavia/frame/timeline'
import { type Harness, SITE } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyPlayer(h: Harness) {
  const { page, check } = h
  const deck = JSON.parse(readFileSync(path.join(SITE, 'deck.json'), 'utf8')) as Deck
  const list = deck.slides[1]?.narration
  const form = deck.slides[2]?.narration
  if (!list || !form) throw new Error('The deck lost its narration.')
  const atWord = (slide: number, word: number) =>
    h.waitFor(PLAYER, (d, at) => d.slide === String(at.slide) && d.word !== '' && Number(d.word) >= at.word, { arg: { slide, word } })

  await page.goto(h.url(''))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  let s = await h.state(PLAYER)
  check('opens on the static title slide, not playing', s.slide === '1' && s.playing === 'false')
  const frame = await page.locator(`${PLAYER} iframe`).evaluate((iframe: HTMLIFrameElement) => ({
    sandbox: iframe.getAttribute('sandbox') ?? '',
    policy: /script-src 'nonce-[0-9a-f]{32}'/.test(iframe.srcdoc),
  }))
  check(
    'slide HTML runs with an opaque origin, and a nonce policy refuses its scripts',
    !frame.sandbox.includes('allow-same-origin') && frame.policy,
    JSON.stringify(frame),
  )
  await page.waitForTimeout(300)
  await h.evidence('1-title.png')
  const background = await page
    .frameLocator(`${PLAYER} iframe`)
    .locator('body')
    .evaluate((b) => getComputedStyle(b).backgroundColor)
  check("the slide's own script did not run", background !== 'rgb(255, 0, 0)', background)

  await h.clickFrame(`${PLAYER} iframe`)
  await page.keyboard.press('ArrowRight')
  await h.waitFor(PLAYER, (d) => d.slide === '2', { timeout: 5000 })
  check('an arrow key pressed inside a slide pages the deck, with author scripts refused', (await h.state(PLAYER)).slide === '2')
  await page.locator(`${PLAYER} segnavia-stage`).press('ArrowLeft')
  await h.waitFor(PLAYER, (d) => d.slide === '1')

  await page.locator(`${PLAYER} segnavia-stage`).press(' ')
  await h.waitFor(PLAYER, (d) => d.slide === '2')
  s = await h.state(PLAYER)
  check('play on a static slide moves on and plays the next', s.slide === '2' && s.playing === 'true')
  await atWord(2, 1)
  check('before its cue, the "New class" annotation is hidden', (await h.state(PLAYER)).shown === '')
  await atWord(2, wordIndex(list, 'New'))
  s = await h.state(PLAYER)
  check('at "New", annotation 1 appears', s.shown === '0', `word=${s.word} shown=${s.shown}`)
  await h.evidence('2-cue-new-class.png')

  await atWord(3, wordIndex(form, 'name'))
  s = await h.state(PLAYER)
  check('the slide advances by itself when its narration ends', s.slide === '3')
  check('at "name", only the name field is marked', s.shown === '0', `shown=${s.shown}`)
  const formSrc = await page.locator(`${PLAYER} segnavia-stage img`).evaluate((img: HTMLImageElement) => img.src)
  check('a shot named by reference resolves to its published image and geometry', formSrc.endsWith('classes.create.form.webp'), formSrc)
  await atWord(3, wordIndex(form, 'grade'))
  check('at "grade", the name mark gives way to the grade mark', (await h.state(PLAYER)).shown === '1')
  await atWord(3, wordIndex(form, 'Create'))
  check('at "Create", the arrow to Create appears', (await h.state(PLAYER)).shown === '2')
  await h.evidence('3-cue-create.png')
  await h.waitFor(PLAYER, (d) => d.slide === '4')
  await page.waitForTimeout(200)
  s = await h.state(PLAYER)
  check('play stops at the closing static slide', s.slide === '4' && s.playing === 'false')
  check('the address names the slide', page.url().endsWith('#slide-4'), page.url())
  await page.locator(`${PLAYER} segnavia-step[to="previous"] button`).click()
  await h.waitFor(PLAYER, (d) => d.slide === '3')
  check('the previous button pages back, and a paused shot shows every annotation', (await h.state(PLAYER)).shown === 'all')
  await page.goto(h.url('#slide-2'))
  await h.waitFor(PLAYER, (d) => d.slide === '2')
  check('a #slide-N link opens that slide', (await h.state(PLAYER)).slide === '2')

  await page.goto(h.url('notes.html#step-2'))
  await h.waitFor(PLAYER, (d) => d.slide === '2')
  const notes = await page.locator(`${PLAYER} segnavia-notes p`).textContent()
  check("notes show beside the slide, and the hash prefix is the host's", notes?.includes('class list') ?? false, notes ?? '')
  await h.evidence('4-notes-light.png')

  await verifyScripted(h)
  await verifyPrefetch(h)
  await verifyPrint(h)
}

async function verifyScripted(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('scripted.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const frame = page.frameLocator(`${PLAYER} iframe`)
  await frame
    .locator('#t', { hasText: 'ran' })
    .waitFor({ timeout: 5000 })
    .catch(() => {})
  check("with scripts sandboxed, the slide's own script runs", (await frame.locator('#t').textContent()) === 'ran')
  const reach = await frame.locator('body').evaluate(() => {
    try {
      return String(window.parent.document.title)
    } catch {
      return 'blocked'
    }
  })
  check('a sandboxed slide cannot reach its host', reach === 'blocked', reach)
  await h.clickFrame(`${PLAYER} iframe`)
  await page.keyboard.press('ArrowRight')
  await h.waitFor(PLAYER, (d) => d.slide === '2', { timeout: 5000 })
  check('keys relay from a scripted slide too', (await h.state(PLAYER)).slide === '2')
  check("hash off leaves the host's address alone", !page.url().includes('#'), page.url())
}

async function verifyPrefetch(h: Harness) {
  const { page, check } = h
  const minted: number[] = []
  await page.exposeFunction('__minted', (index: number) => minted.push(index))
  await page.goto(h.url('prefetch.html'))
  await page.evaluate(async () => {
    await customElements.whenDefined('segnavia-player')
    const player = document.getElementById('d') as HTMLElement & { resolveSlide: unknown }
    player.resolveSlide = (slide: { content: unknown }, index: number) => {
      ;(window as unknown as { __minted: (i: number) => void }).__minted(index)
      return slide.content
    }
  })
  await page.locator(`${PLAYER} segnavia-stage`).press('ArrowRight')
  await h.waitFor(PLAYER, (d) => d.slide === '2')
  await page.waitForTimeout(300)
  const twice = [...new Set(minted)].filter((index) => minted.filter((m) => m === index).length > (index === 0 ? 2 : 1))
  check('prefetch resolves the next slide ahead, and the shown slide is never minted twice', minted.includes(2) && twice.length === 0, `minted=${minted}`)
}

async function verifyPrint(h: Harness) {
  const { page, check } = h
  await page.goto(h.url(''))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const printed = await page.evaluate(async () => {
    const bundle = '/segnavia.js'
    const lib = (await import(bundle)) as { printDeck: (deck: unknown, options: unknown) => Promise<void> }
    const deck = await (await fetch('/deck-print.json')).json()
    const started = performance.now()
    let sheets = 0
    let frames = 0
    await lib.printDeck(deck, {
      print: (win: Window) => {
        sheets = win.document.querySelectorAll('.sheet').length
        frames = win.document.querySelectorAll('iframe').length
      },
    })
    return { sheets, frames, ms: Math.round(performance.now() - started) }
  })
  check(
    'printing from the browser waits for every slide to report ready, not for the deadline',
    printed.sheets === 4 && printed.frames === 2 && printed.ms < 3500,
    JSON.stringify(printed),
  )
}
