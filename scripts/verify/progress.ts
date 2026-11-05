import type { SeekPolicy } from '@segnavia/frame'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = '#progress-player'
const PAUSED_OBSERVATION_MS = 500

interface ProgressFacts {
  complete: number
  end: number
}

interface RailLoadFacts {
  missing: string | null
  reloads: number
}

async function installFacts(h: Harness) {
  await h.page.locator(PLAYER).evaluate((player: HTMLElement & { controller: EventTarget }) => {
    const facts: ProgressFacts = { complete: 0, end: 0 }
    player.controller.addEventListener('complete', () => facts.complete++)
    player.controller.addEventListener('end', () => facts.end++)
    ;(window as unknown as { progressFacts: ProgressFacts }).progressFacts = facts
  })
}

async function loadProgressDeck(h: Harness, seek: SeekPolicy) {
  await h.page.locator(PLAYER).evaluate(
    async (
      player: HTMLElement & {
        controller: { go(index: number): Promise<void>; load(deck: unknown): Promise<void>; setPlayerOptions(options: { seek: SeekPolicy }): void }
      },
      policy,
    ) => {
      await player.controller.go(0)
      player.controller.setPlayerOptions({ seek: policy })
      await player.controller.load(await fetch('deck-progress.json').then((response) => response.json()))
    },
    seek,
  )
}

async function installRailLoadFacts(h: Harness) {
  await h.page.locator(PLAYER).evaluate((player: HTMLElement) => {
    const playerRoot = player.shadowRoot
    const rail = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot
    const facts: RailLoadFacts = {
      missing: !playerRoot ? 'player shadow root' : !rail ? 'rail shadow root' : null,
      reloads: 0,
    }
    const loaded = new WeakSet<HTMLIFrameElement>()
    const onLoad = (event: Event) => {
      if (!(event.target instanceof HTMLIFrameElement)) return
      if (loaded.has(event.target)) facts.reloads++
      else loaded.add(event.target)
    }
    rail?.addEventListener('load', onLoad, { capture: true })
    ;(window as unknown as { railLoadFacts: { facts: RailLoadFacts; stop(): void } }).railLoadFacts = {
      facts,
      stop: () => rail?.removeEventListener('load', onLoad, { capture: true }),
    }
  })
}

async function readRailLoadFacts(h: Harness): Promise<RailLoadFacts> {
  return h.page.evaluate(() => {
    const observation = (window as unknown as { railLoadFacts: { facts: RailLoadFacts; stop(): void } }).railLoadFacts
    observation.stop()
    return observation.facts
  })
}

export async function verifyProgress(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('progress.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await installFacts(h)

  await loadProgressDeck(h, 'free')
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { go(index: number): Promise<void>; next(): Promise<void> } }) => {
    await player.controller.go(2)
    await player.controller.next()
  })
  let facts = await page.evaluate(() => (window as unknown as { progressFacts: ProgressFacts }).progressFacts)
  check('a free skip to the end emits end without complete', facts.end === 1 && facts.complete === 0, JSON.stringify(facts))

  await installRailLoadFacts(h)
  await loadProgressDeck(h, 'free')
  await page.locator(PLAYER).evaluate((player: HTMLElement & { controller: { play(): Promise<void> } }) => player.controller.play())
  await page.waitForFunction(() => {
    const facts = (window as unknown as { progressFacts: ProgressFacts }).progressFacts
    return facts.end === 2
  })
  facts = await page.evaluate(() => (window as unknown as { progressFacts: ProgressFacts }).progressFacts)
  check('watching a timed deck through emits complete exactly once', facts.complete === 1, JSON.stringify(facts))
  const railLoads = await readRailLoadFacts(h)
  check('rail thumbnails do not reload while the deck plays', railLoads.missing === null && railLoads.reloads === 0, JSON.stringify(railLoads))

  await loadProgressDeck(h, 'furthest')
  await page.locator(PLAYER).evaluate(
    (
      player: HTMLElement & {
        controller: EventTarget & {
          state: { index: number; watched: { reach: { ms: number } } }
          pause(): void
          play(): Promise<void>
        }
      },
    ) =>
      new Promise<void>((resolve, reject) => {
        const onChange = () => {
          const { state } = player.controller
          if (state.index !== 0 || state.watched.reach.ms < 100) return
          player.controller.removeEventListener('change', onChange)
          player.controller.pause()
          resolve()
        }
        player.controller.addEventListener('change', onChange)
        player.controller.play().catch(reject)
      }),
  )

  const currentSlide = async () => (await h.state(PLAYER)).slide
  const pausedReachIndex = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { watched: { reach: { index: number } } } } }) => player.controller.state.watched.reach.index)
  check(
    'furthest mode pauses on the first slide before testing the limit',
    (await currentSlide()) === '1' && pausedReachIndex === 0,
    JSON.stringify({ slide: await currentSlide(), reachIndex: pausedReachIndex }),
  )
  const pausedUpdates = await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: EventTarget }, waitMs) => {
    const playerRoot = player.shadowRoot
    const rail = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot
    const missing = !playerRoot ? 'player shadow root' : !rail ? 'rail shadow root' : null
    if (missing) return { changes: null, loads: null, missing }
    let changes = 0
    let loads = 0
    const onChange = () => changes++
    const onLoad = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) loads++
    }
    player.controller.addEventListener('change', onChange, { capture: true })
    rail.addEventListener('load', onLoad, { capture: true })
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    player.controller.removeEventListener('change', onChange, { capture: true })
    rail.removeEventListener('load', onLoad, { capture: true })
    return { changes, loads, missing }
  }, PAUSED_OBSERVATION_MS)
  check(
    'pausing from a change listener stops playback updates and leaves rail thumbnails loaded',
    pausedUpdates.missing === null && pausedUpdates.changes === 0 && pausedUpdates.loads === 0,
    JSON.stringify(pausedUpdates),
  )
  await page.locator(`${PLAYER} segnavia-stage`).press('ArrowRight')
  check('furthest mode refuses the keyboard next key past the watched limit', (await currentSlide()) === '1')
  await page.locator(`${PLAYER} segnavia-track button[data-go="2"]`).click()
  check('furthest mode refuses a later track segment past the watched limit', (await currentSlide()) === '1')
  const step = page.locator(`${PLAYER} segnavia-step[to="next"] button`)
  const stepDisabled = await step.isDisabled()
  check('furthest mode disables the step forward button', stepDisabled)
  await page.locator(`${PLAYER} segnavia-rail button[data-index="2"]`).click()
  check('furthest mode refuses a later rail slide past the watched limit', (await currentSlide()) === '1')
  const locked = await page
    .locator(`${PLAYER} segnavia-track [data-go]`)
    .evaluateAll((segments) => segments.slice(1).map((segment) => segment.getAttribute('data-state')))
  check('furthest mode marks every later track segment locked', locked.length === 2 && locked.every((state) => state === 'locked'), locked.join(','))
  await page.evaluate(() => {
    location.hash = '#slide-3'
  })
  await page.waitForFunction(() => location.hash === '#slide-1')
  check('furthest mode refuses a later hash and restores the current slide hash', (await currentSlide()) === '1' && page.url().endsWith('#slide-1'), page.url())

  await verifyStrictCsp(h)
}

async function verifyStrictCsp(h: Harness) {
  const { page, check } = h
  const violation = page
    .waitForEvent('console', {
      predicate: (message) => message.text().includes('Content Security Policy') && message.text().includes('inline script'),
      timeout: BOUNDED_WAIT_MS,
    })
    .catch(() => null)
  await page.goto(h.url('strict-csp.html'))
  await h.waitFor('#strict-player', (data) => data.slide === '1')
  const slideRendered = (await page.frameLocator('#strict-player iframe').locator('#progress-one').textContent()) === 'progress-one'
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  const sandbox = await page.locator('#strict-player iframe').getAttribute('sandbox')
  const audioResponse = page
    .waitForResponse((response) => response.url().endsWith('/audio/progress.wav?strict'), { timeout: BOUNDED_WAIT_MS })
    .catch(() => null)
  await page.locator('#strict-player').evaluate((player: HTMLElement & { controller: { play(): Promise<void> } }) => player.controller.play())
  const audioLoaded = (await audioResponse)?.ok() === true
  const violationText = (await violation)?.text() ?? ''
  const ready = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages.includes('segnavia:ready'))
  check(
    'a strict host CSP still renders a slide in a sandbox without same-origin',
    slideRendered &&
      policy?.includes("script-src 'self'") === true &&
      !policy.includes("script-src 'self' 'unsafe-inline'") &&
      !sandbox?.includes('allow-same-origin'),
    JSON.stringify({ policy, sandbox }),
  )
  check("a strict host CSP with media-src 'self' loads same-origin narration audio", audioLoaded)
  check(
    'without unsafe-inline, host script-src blocks the frame bridge and must allow its inline script',
    !ready && violationText.includes("script-src 'self'"),
    violationText || 'no CSP violation was reported',
  )
}
