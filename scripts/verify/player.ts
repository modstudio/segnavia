// The skin playing the English deck: paging, play mode, cues, the frame's
// policy and bridge, shot references, notes, scripts, prefetch and print.

import '../source-guard.ts'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Deck } from '@segnavia/format'
import { wordIndex } from '@segnavia/frame/timeline'
import { BOUNDED_WAIT_MS, type Harness, SITE } from './harness.ts'
import { verifyWindowPresentation } from './player-presentation.ts'

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
  await verifyControlBar(h, 'step')
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
  await h.waitFor(PLAYER, (d) => d.slide === '2', { timeout: BOUNDED_WAIT_MS })
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
  await verifyContinuousPlayer(h)
}

async function verifyControlBar(h: Harness, mode: 'step' | 'continuous') {
  const { page, check } = h
  for (const width of [960, 560, 360]) {
    await page.setViewportSize({ width: width + 48, height: 816 })
    const geometry = await page.evaluate(() => {
      const player = document.querySelector('segnavia-player') as HTMLElement
      const root = player.shadowRoot as ShadowRoot
      const play = root.querySelector('segnavia-play')?.shadowRoot?.querySelector('button') as HTMLElement
      const previous = root.querySelector('segnavia-step[to="previous"]')?.shadowRoot?.querySelector('button') as HTMLElement
      const next = root.querySelector('segnavia-step[to="next"]')?.shadowRoot?.querySelector('button') as HTMLElement
      const end = root.querySelector('.end') as HTMLElement
      const counter = root.querySelector('segnavia-counter') as HTMLElement
      const notes = root.querySelector('segnavia-notes') as HTMLElement
      const presentation = root.querySelector('segnavia-fullscreen') as HTMLElement
      const playerBox = player.getBoundingClientRect()
      const playBox = play.getBoundingClientRect()
      const previousBox = previous.getBoundingClientRect()
      const nextBox = next.getBoundingClientRect()
      const endBox = end.getBoundingClientRect()
      const segmentBoxes = [...(root.querySelector('segnavia-track')?.shadowRoot?.querySelectorAll('.segment') ?? [])].map((segment) =>
        segment.getBoundingClientRect(),
      )
      return {
        centred: Math.abs(playBox.left + playBox.width / 2 - (playerBox.left + playerBox.width / 2)) < 1,
        centreVisible: [previousBox, playBox, nextBox].every((box) => box.width > 0 && box.height > 0),
        centreClear: nextBox.right <= endBox.left,
        segmentCount: segmentBoxes.length,
        segmentsSeparated: segmentBoxes.every((box, index) => index === 0 || box.left > (segmentBoxes[index - 1]?.right ?? box.left)),
        counter: getComputedStyle(counter).display,
        notes: getComputedStyle(notes).display,
        presentation: getComputedStyle(presentation).display,
      }
    })
    check(`${mode} bar keeps play centred at ${width}px`, geometry.centred, JSON.stringify(geometry))
    check(
      `${mode} bar shows previous, play and next without overlapping the end group at ${width}px`,
      geometry.centreVisible && geometry.centreClear,
      JSON.stringify(geometry),
    )
    if (mode === 'continuous' && width === 960) {
      check(
        'continuous track shows one separated segment per slide at 960px',
        geometry.segmentCount === 4 && geometry.segmentsSeparated,
        JSON.stringify(geometry),
      )
    }
    if (width === 560) check('560px bar hides its counter and notes panel', geometry.counter === 'none' && geometry.notes === 'none', JSON.stringify(geometry))
    if (width === 360) check('360px bar hides presentation', geometry.presentation === 'none', JSON.stringify(geometry))
    await h.evidence(`player-${mode}-${width}.png`)
  }
  await page.setViewportSize({ width: 1280, height: 816 })
}

async function verifyContinuousPlayer(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('continuous.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  await verifyControlBar(h, 'continuous')
  check('an actions slot button appears in the end group', await page.locator('#host-action').isVisible())

  const track = page.locator(`${PLAYER} segnavia-track ol`)
  const box = await track.boundingBox()
  if (!box) throw new Error('The continuous track has no box.')
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)
  await page.waitForTimeout(50)
  const clicked = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { elapsedMs: number; totalMs: number } } }) => player.controller.state)
  check(
    'clicking the continuous track seeks deck time',
    clicked.elapsedMs > clicked.totalMs * 0.35 && clicked.elapsedMs < clicked.totalMs * 0.65,
    JSON.stringify(clicked),
  )
  await track.focus()
  const beforeKey = clicked.elapsedMs
  await track.press('ArrowRight')
  await page.waitForTimeout(50)
  const afterKey = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { elapsedMs: number } } }) => player.controller.state.elapsedMs)
  check('continuous slider arrows seek five seconds', Math.abs(afterKey - beforeKey - 5000) < 50, `${beforeKey} -> ${afterKey}`)

  const mute = page.locator(`${PLAYER} segnavia-mute button`)
  await mute.click()
  check('mute toggles with aria-pressed', (await mute.getAttribute('aria-pressed')) === 'true')
  await mute.click()
  const captions = page.locator(`${PLAYER} segnavia-captions button`)
  await captions.click()
  check('CC toggles with aria-pressed', (await captions.getAttribute('aria-pressed')) === 'false')
  await captions.click()
  await verifyWindowPresentation(h)

  await page.goto(h.url('parts.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const partsCaptions = page.locator(`${PLAYER} segnavia-captions button`)
  if ((await partsCaptions.getAttribute('aria-pressed')) === 'false') await partsCaptions.click()
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { go(index: number): Promise<void>; play(): Promise<void> } }) => {
    await player.controller.go(1)
    await player.controller.play()
  })
  await h.waitFor(PLAYER, (d) => d.word !== '')
  const wordOutline = await page.locator(`${PLAYER} segnavia-caption span.active`).evaluate((word) => getComputedStyle(word).outlineColor)
  check('a ::part(word-current) host style applies', wordOutline === 'rgb(255, 0, 255)', wordOutline)
  await verifySlottedPlayIcons(h)
}

async function verifySlottedPlayIcons(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('icons.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const activeIcon = () =>
    page.locator(PLAYER).evaluate((player) => {
      const play = player.shadowRoot?.querySelector('segnavia-play')
      const active = play?.shadowRoot?.querySelector<HTMLSlotElement>('slot:not([hidden])')
      const forwarded = active?.assignedElements()[0] as HTMLSlotElement | undefined
      return {
        slot: active?.name ?? '',
        custom: forwarded?.assignedElements()[0]?.getAttribute('data-custom-icon') ?? '',
      }
    })
  const stopped = await activeIcon()
  check('a player play-icon slot replaces the built-in icon', stopped.slot === 'icon-play' && stopped.custom === 'play', JSON.stringify(stopped))
  await page.locator(`${PLAYER} segnavia-play button`).click()
  await h.waitFor(PLAYER, (d) => d.playing === 'true')
  const playing = await activeIcon()
  check(
    'the slotted play icon changes to the slotted pause icon while playing',
    playing.slot === 'icon-pause' && playing.custom === 'pause',
    JSON.stringify(playing),
  )
  await page.locator(`${PLAYER} segnavia-play button`).click()
}

async function verifyScripted(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('scripted.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const frame = page.frameLocator(`${PLAYER} iframe`)
  await frame
    .locator('#t', { hasText: 'ran' })
    .waitFor({ timeout: BOUNDED_WAIT_MS })
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
  await h.waitFor(PLAYER, (d) => d.slide === '2', { timeout: BOUNDED_WAIT_MS })
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
    const ms = Math.round(performance.now() - started)
    const slides = Array.from({ length: 7 }, (_, index) => ({
      ...deck.slides[index % deck.slides.length],
      id: `handout-${index}`,
    }))
    let papers = 0
    let placements = 0
    const handoutStarted = performance.now()
    await lib.printDeck(
      { ...deck, slides },
      {
        imposition: {
          paper: 'letter',
          orientation: 'portrait',
          unit: 'mm',
          columns: 2,
          rows: 3,
          cell: { width: 90, height: 70 },
          margin: { top: 12, right: 12, bottom: 12, left: 12 },
          gap: { column: 8, row: 8 },
          bleed: 0,
          fit: 'contain',
        },
        print: (win: Window) => {
          papers = win.document.querySelectorAll('.paper').length
          placements = win.document.querySelectorAll('.placement').length
        },
      },
    )
    return { sheets, frames, ms, papers, placements, handoutMs: Math.round(performance.now() - handoutStarted) }
  })
  check(
    'printing from the browser waits for every slide to report ready, not for the deadline',
    printed.sheets === 4 && printed.frames === 2 && printed.ms < 3500,
    JSON.stringify(printed),
  )
  check(
    'browser handout printing exposes two papers and seven placement boxes before the deadline',
    printed.papers === 2 && printed.placements === 7 && printed.handoutMs < 3500,
    JSON.stringify(printed),
  )
}
