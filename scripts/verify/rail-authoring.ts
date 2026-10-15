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

async function playerGeometry(h: Harness, file: string, width: number) {
  await h.page.setViewportSize({ width, height: 816 })
  await h.page.goto(h.url(file))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  return h.page.locator(PLAYER).evaluate((player) => {
    const stage = player.shadowRoot?.querySelector('segnavia-stage') as HTMLElement
    const screen = player.shadowRoot?.querySelector('.screen') as HTMLElement
    const playerBox = player.getBoundingClientRect()
    const stageBox = stage.getBoundingClientRect()
    const screenBox = screen.getBoundingClientRect()
    return {
      player: { width: playerBox.width, height: playerBox.height },
      screen: { width: screenBox.width, height: screenBox.height },
      stage: { width: stageBox.width, height: stageBox.height },
    }
  })
}

export async function verifyRailAuthoring(h: Harness) {
  const { page, check } = h
  for (const width of [1280, 360]) {
    const flow = await playerGeometry(h, 'flow.html', width)
    check(
      `an unsized ${width}px player fills its inline size at 16:9`,
      Math.abs(flow.stage.width - flow.player.width) <= 2 && Math.abs(flow.stage.width / flow.stage.height - 16 / 9) < 0.01,
      JSON.stringify(flow),
    )
  }
  const sized = await playerGeometry(h, 'index.html', 1280)
  check('a height-sized player keeps its slide inside the available screen', sized.stage.height <= sized.screen.height, JSON.stringify(sized))
  const flowRail = await playerGeometry(h, 'flow-rail.html', 1280)
  check(
    'an unsized player with a rail fills the remaining slide area at 16:9',
    Math.abs(flowRail.stage.width - flowRail.screen.width) <= 2 && Math.abs(flowRail.stage.width / flowRail.stage.height - 16 / 9) < 0.01,
    JSON.stringify(flowRail),
  )
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
  await second.press('ArrowRight')
  await page.keyboard.press('Enter')
  await h.waitFor(PLAYER, (data) => data.slide === '3')
  check('thumbnail arrows and Enter navigate', (await h.state(PLAYER)).slide === '3')

  await page.setViewportSize({ width: 1000, height: 816 })
  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)
  await page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot
    const first = root?.querySelector<HTMLButtonElement>('button[data-index="0"]')
    const second = root?.querySelector<HTMLButtonElement>('button[data-index="1"]')
    if (!first || !second) throw new Error('The reorder thumbnails were not ready.')
    const transfer = new DataTransfer()
    first.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, dataTransfer: transfer }))
    const box = second.getBoundingClientRect()
    second.dispatchEvent(
      new DragEvent('dragover', { bubbles: true, composed: true, dataTransfer: transfer, clientX: box.left + box.width / 2, clientY: box.bottom - 1 }),
    )
    second.dispatchEvent(
      new DragEvent('drop', { bubbles: true, composed: true, dataTransfer: transfer, clientX: box.left + box.width / 2, clientY: box.bottom - 1 }),
    )
  })
  await page.waitForFunction(
    () =>
      (document.querySelector('segnavia-player') as HTMLElement & { controller: { state: { deck: { slides: Array<{ id: string }> } } } }).controller.state.deck
        .slides[0]?.id === 'second',
  )
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

  await page.setViewportSize({ width: 408, height: 816 })
  await page.goto(h.url('authoring-rtl.html'))
  await page.waitForFunction(() => 'authoring' in window)
  const rtlDrag = await page.locator(PLAYER).evaluate(async (player) => {
    const root = player.shadowRoot?.querySelector('segnavia-rail')?.shadowRoot
    const first = root?.querySelector<HTMLButtonElement>('button[data-index="0"]')
    const second = root?.querySelector<HTMLButtonElement>('button[data-index="1"]')
    if (!first || !second) throw new Error('The RTL reorder thumbnails were not ready.')
    const transfer = new DataTransfer()
    first.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, dataTransfer: transfer }))
    const box = second.getBoundingClientRect()
    second.dispatchEvent(new DragEvent('dragover', { bubbles: true, composed: true, dataTransfer: transfer, clientX: box.left + 1 }))
    const marker = second.dataset.insert
    second.dispatchEvent(new DragEvent('drop', { bubbles: true, composed: true, dataTransfer: transfer, clientX: box.left + 1 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const slides = (player as HTMLElement & { controller: { state: { deck: { slides: Array<{ id: string }> } } } }).controller.state.deck.slides
    return { marker, ids: slides.map((slide) => slide.id).join(',') }
  })
  check('RTL pointer drag uses the logical after side', rtlDrag.marker === 'after' && rtlDrag.ids === 'second,probe', JSON.stringify(rtlDrag))

  await page.setViewportSize({ width: 1000, height: 816 })
  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)

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
  const removal = await page.evaluate(async () => {
    const holder = window as unknown as {
      authoring: { update(handlers: { moveSlide(input: unknown): Promise<void> }): Promise<void> }
      authoringFacts: { errors: number }
    }
    const before = holder.authoringFacts.errors
    await holder.authoring.update({ moveSlide: async () => {} })
    const root = document.querySelector('segnavia-player')?.shadowRoot
    return {
      errors: holder.authoringFacts.errors - before,
      text: (root?.querySelector('textarea') as HTMLTextAreaElement | null)?.value,
      status: root?.querySelector('[data-authoring-status]')?.textContent,
    }
  })
  check(
    'removing notes after a failed final flush keeps the draft and retry editor',
    removal.errors === 1 && removal.text === 'Rejected draft' && removal.status?.includes('Try again') === true,
    JSON.stringify(removal),
  )

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
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  const reactLabel = await page.locator(`${PLAYER} .player`).getAttribute('aria-label')
  check(
    'React renders the player and applies a later prop update',
    reactLabel === 'React player' && (await page.locator(PLAYER).getAttribute('rail')) === '',
    reactLabel ?? '',
  )
  const reactNotes = page.locator(`${PLAYER} textarea[part="notes-editor"]`)
  await reactNotes.fill('React draft')
  await page.evaluate(() => (window as unknown as { reactConfigureAuthoring(): void }).reactConfigureAuthoring())
  await page.waitForTimeout(700)
  const authoringUpdate = await page.evaluate(() => {
    const field = document.querySelector('segnavia-player')?.shadowRoot?.querySelector('textarea')
    const facts = (window as unknown as { reactFacts: { saves: string[] } }).reactFacts
    return { text: field?.value, maxLength: field?.maxLength, saves: facts.saves }
  })
  check(
    'React authoring updates preserve a debounced draft',
    authoringUpdate.text === 'React draft' && authoringUpdate.maxLength === 1234 && authoringUpdate.saves.join(',') === 'React draft',
    JSON.stringify(authoringUpdate),
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
