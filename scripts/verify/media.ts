// Recorded audio driving a slide, live speech in the narration's language,
// host-served and image slides, full screen, and a host's style in a slide.

import type { Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

// Headless Chromium has no voices, so the speech engine is replaced with one
// that reports word boundaries as browsers do: a character index per word.
function installFakes() {
  const record = { speechLang: [] as string[], audioPlaying: 0 }
  Object.defineProperty(window, '__media', { value: record })
  let timer = 0
  class FakeUtterance {
    lang = ''
    voice: unknown = null
    onboundary: ((event: { name: string; charIndex: number }) => void) | null = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(public text: string) {}
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance })
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: () => [],
      cancel: () => clearTimeout(timer),
      speak(utterance: FakeUtterance) {
        record.speechLang.push(utterance.lang)
        const offsets = [...utterance.text.matchAll(/\S+/g)].map((match) => match.index ?? 0)
        let next = 0
        const step = () => {
          if (next < offsets.length) {
            utterance.onboundary?.({ name: 'word', charIndex: offsets[next++] ?? 0 })
            timer = window.setTimeout(step, 150)
          } else utterance.onend?.()
        }
        timer = window.setTimeout(step, 100)
      },
    },
  })
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    this.addEventListener('playing', () => record.audioPlaying++, { once: true })
    return play.call(this)
  }
}

export async function verifyMedia(h: Harness) {
  const { page, check } = h
  await page.addInitScript(installFakes)
  await page.goto(h.url('media.html'))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  const started = Date.now()
  await page.locator(`${PLAYER} segnavia-play button`).click()
  await h.waitFor(PLAYER, (d) => d.shown === '0', { timeout: 10000 })
  check('a cue fires on its word while recorded audio plays', (await h.state(PLAYER)).shown === '0')
  await h.waitFor(PLAYER, (d) => d.slide === '2', { timeout: 10000 })
  const elapsed = Date.now() - started
  const media = await page.evaluate(() => (window as unknown as { __media: { speechLang: string[]; audioPlaying: number } }).__media)
  check(
    'the recorded audio actually played, and the slide lasted as long as it',
    media.audioPlaying >= 1 && elapsed >= 2200,
    `playing=${media.audioPlaying} elapsed=${elapsed}ms`,
  )

  await h.waitFor(PLAYER, (d) => d.shown === '0', { timeout: 10000 })
  const live = await page.evaluate(() => (window as unknown as { __media: { speechLang: string[] } }).__media.speechLang)
  check(
    'live narration is spoken in its language, and its cue fires on the word the engine reports',
    live.includes('en-GB') && (await h.state(PLAYER)).shown === '0',
    live.join(','),
  )
  await h.waitFor(PLAYER, (d) => d.slide === '3', { timeout: 10000 })
  check('when the engine finishes, play moves on and stops at the static slide', (await h.state(PLAYER)).playing === 'false')
  const served = await page
    .frameLocator(`${PLAYER} iframe`)
    .locator('#served')
    .textContent({ timeout: 5000 })
    .catch(() => null)
  check('a slide the host serves at its own URL is shown', served === 'Served by the host', served ?? '')
  await page.locator(`${PLAYER} segnavia-step[to="next"] button`).click()
  await h.waitFor(PLAYER, (d) => d.slide === '4')
  const alt = await page.locator(`${PLAYER} segnavia-stage img`).getAttribute('alt')
  check('an image slide is shown with its description', alt === 'The new class form', alt ?? '')

  await page.locator(`${PLAYER} segnavia-fullscreen button`).click()
  await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 5000 }).catch(() => {})
  const full = await page.evaluate(() => document.fullscreenElement?.tagName ?? 'none')
  check('the full-screen control makes the player full screen', full === 'SEGNAVIA-PLAYER', full)
  await page.keyboard.press('Escape')

  await page.goto(h.url(''))
  await h.waitFor(PLAYER, (d) => d.slide === '1')
  await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & { css: string; controller: { go(i: number): Promise<void> } }
    player.css = 'h1{color:rgb(1, 2, 3)}'
    await player.controller.go(1)
    await player.controller.go(0)
  })
  await page.waitForTimeout(300)
  const colour = await page
    .frameLocator(`${PLAYER} iframe`)
    .locator('h1')
    .evaluate((h1) => getComputedStyle(h1).color)
  check("the host's style reaches inside a slide", colour === 'rgb(1, 2, 3)', colour)
  await page.addStyleTag({ content: 'segnavia-player::part(bar){background:rgb(4, 5, 6)} segnavia-player{--segnavia-accent:rgb(200, 0, 100)}' })
  await page.mouse.move(0, 0)
  const part = await page.evaluate(() => {
    const root = (document.querySelector('segnavia-player') as HTMLElement).shadowRoot as ShadowRoot
    const play = root.querySelector('segnavia-play')?.shadowRoot?.querySelector('button') as HTMLElement
    return { bar: getComputedStyle(root.querySelector('.bar') as HTMLElement).backgroundColor, accent: getComputedStyle(play).backgroundColor }
  })
  check(
    'a host restyles the player through ::part and --segnavia-* properties',
    part.bar === 'rgb(4, 5, 6)' && part.accent === 'rgb(200, 0, 100)',
    JSON.stringify(part),
  )
}
