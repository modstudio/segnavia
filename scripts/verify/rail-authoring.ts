import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Harness, SITE } from './harness.ts'

const PLAYER = 'segnavia-player'

async function railGeometry(h: Harness, file: string) {
  await h.page.goto(h.url(file))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const box = (selector: string) => (root.querySelector(selector) as HTMLElement).getBoundingClientRect()
    const rail = box('segnavia-rail')
    const screen = box('.screen')
    const bar = box('.bar')
    return { rail: { left: rail.left, right: rail.right, top: rail.top }, screen: { left: screen.left, right: screen.right }, barBottom: bar.bottom }
  })
}

export async function verifyRailAuthoring(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 1000, height: 816 })
  const ltr = await railGeometry(h, 'rail.html')
  check('rail sits at inline start in LTR', ltr.rail.right <= ltr.screen.left, JSON.stringify(ltr))
  await h.evidence('rail-ltr.png')
  const rtl = await railGeometry(h, 'rail-rtl.html')
  check('rail sits at inline start in RTL', rtl.rail.left >= rtl.screen.right, JSON.stringify(rtl))
  await h.evidence('rail-rtl.png')
  await page.setViewportSize({ width: 408, height: 816 })
  const narrow = await railGeometry(h, 'rail.html')
  check('rail moves below the bar at a 360px container', narrow.rail.top >= narrow.barBottom, JSON.stringify(narrow))
  await h.evidence('rail-360.png')

  const second = page.locator(`${PLAYER} segnavia-rail button[data-index="1"]`)
  await second.click()
  await h.waitFor(PLAYER, (data) => data.slide === '2')
  check('thumbnail click navigates', (await h.state(PLAYER)).slide === '2')
  await second.focus()
  await second.press('ArrowDown')
  await page.keyboard.press('Enter')
  await h.waitFor(PLAYER, (data) => data.slide === '3')
  check('thumbnail arrows and Enter navigate', (await h.state(PLAYER)).slide === '3')

  await page.setViewportSize({ width: 1000, height: 816 })
  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)
  const first = page.locator(`${PLAYER} segnavia-rail button[data-index="0"]`)
  const secondAuthoring = page.locator(`${PLAYER} segnavia-rail button[data-index="1"]`)
  await first.dragTo(secondAuthoring)
  await page.waitForTimeout(50)
  let ids = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { deck: { slides: Array<{ id: string }> } } } }) =>
      player.controller.state.deck.slides.map((slide) => slide.id),
    )
  check('pointer drag reorders thumbnails optimistically', ids.join(',') === 'second,probe', ids.join(','))
  await page.evaluate(() => ((window as unknown as { authoringFacts: { rejectMove: boolean } }).authoringFacts.rejectMove = true))
  await page.locator(`${PLAYER} segnavia-rail button[data-index="0"]`).press('Alt+ArrowDown')
  await page.waitForTimeout(100)
  ids = await page
    .locator(PLAYER)
    .evaluate((player: HTMLElement & { controller: { state: { deck: { slides: Array<{ id: string }> } } } }) =>
      player.controller.state.deck.slides.map((slide) => slide.id),
    )
  check('a rejected keyboard reorder rolls back', ids.join(',') === 'second,probe', ids.join(','))

  const notes = page.locator(`${PLAYER} textarea[part="notes-editor"]`)
  await notes.fill('Draft one')
  await page.waitForTimeout(700)
  const facts = await page.evaluate(() => (window as unknown as { authoringFacts: { saves: unknown[]; dirty: boolean[] } }).authoringFacts)
  check('notes autosave and emit dirty changes', facts.saves.length === 1 && facts.dirty.includes(true) && facts.dirty.includes(false), JSON.stringify(facts))
  await page.evaluate(() => ((window as unknown as { authoringFacts: { rejectNotes: boolean } }).authoringFacts.rejectNotes = true))
  await notes.fill('Rejected draft')
  await page.waitForTimeout(700)
  const status = await page.locator(`${PLAYER} [data-authoring-status]`).textContent()
  check('a rejected note remains with Try again and the error', status?.includes('Try again') === true && status.includes('Notes refused'), status ?? '')

  await page.locator('#unprotected').focus()
  await page.waitForTimeout(80)
  await page.keyboard.press('x')
  const stolen = await page.frameLocator(`${PLAYER} segnavia-stage iframe`).locator('#keys').textContent()
  check('the probe slide takes a key from an unprotected input', Number(stolen) > 0, stolen ?? '')
  await notes.focus()
  await page.waitForTimeout(80)
  await page.keyboard.press('y')
  const protectedText = await notes.inputValue()
  const protectedKeys = await page.frameLocator(`${PLAYER} segnavia-stage iframe`).locator('#keys').textContent()
  check('the probe slide takes no key from focused notes', protectedText.endsWith('y') && protectedKeys === '0', `${protectedText}; probe=${protectedKeys}`)
  await h.evidence('authoring.png')

  await page.goto(h.url('react.html'))
  await page.waitForFunction(() => 'reactSetRail' in window && document.querySelector('segnavia-player'))
  await page.evaluate(() => (window as unknown as { reactSetRail(value: boolean): void }).reactSetRail(true))
  await page.waitForFunction(() => document.querySelector('segnavia-player')?.hasAttribute('rail'))
  const reactLabel = await page.locator(PLAYER).getAttribute('aria-label')
  check(
    'React renders the player and applies a later prop update',
    reactLabel === 'React player' && (await page.locator(PLAYER).getAttribute('rail')) === '',
    reactLabel ?? '',
  )
  const detached = await page.evaluate(() => {
    const holder = window as unknown as { reactPlayer: HTMLElement; reactUnmount(): void }
    const player = holder.reactPlayer
    holder.reactUnmount()
    return player.shadowRoot?.querySelector('[data-authoring-notes]') === null
  })
  check('React unmount detaches authoring', detached)

  const playerBundle = readFileSync(path.join(SITE, 'segnavia-player.js'), 'utf8')
  const controlsBundle = readFileSync(path.join(SITE, 'segnavia-controls.js'), 'utf8')
  check('viewer bundles contain no authoring layer', !playerBundle.includes('attachAuthoring') && !controlsBundle.includes('attachAuthoring'))
  await page.setViewportSize({ width: 1280, height: 816 })
}
