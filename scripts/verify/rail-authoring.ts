import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Harness, SITE } from './harness.ts'
import { verifyReactAuthoring } from './react-authoring.ts'

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

async function verifyReloadedNotes(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)
  const notes = page.locator(`${PLAYER} textarea[part="notes-editor"]`)
  await notes.fill('PROBE saved by debounce')
  await page.waitForFunction(() =>
    (window as unknown as { authoringFacts: { saves: Array<{ notes: string }> } }).authoringFacts.saves.some(
      (save) => save.notes === 'PROBE saved by debounce',
    ),
  )
  await page.waitForTimeout(200)
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { next(): Promise<void>; previous(): Promise<void> } }) => {
    await player.controller.next()
    await player.controller.previous()
  })
  check('a slide turn after autosave keeps the saved notes', (await notes.inputValue()) === 'PROBE saved by debounce', await notes.inputValue())
  await page.locator(`${PLAYER} segnavia-rail button[data-index="0"]`).press('Alt+ArrowDown')
  await page.waitForFunction(
    () =>
      (document.querySelector('segnavia-player') as HTMLElement & { controller: { state: { deck: { slides: Array<{ id: string }> } } } }).controller.state.deck
        .slides[1]?.id === 'probe',
  )
  check('an optimistic reorder after autosave keeps the saved notes', (await notes.inputValue()) === 'PROBE saved by debounce', await notes.inputValue())
  const clean = await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    const holder = window as unknown as { authoring: { dirty: boolean }; authoringFacts: { dirty: boolean[] } }
    const before = holder.authoringFacts.dirty.length
    const deck = player.controller.state.deck
    await player.controller.load({ ...deck, slides: deck.slides.map((slide) => ({ ...slide, notes: 'Host clean' })) })
    return { dirty: holder.authoring.dirty, events: holder.authoringFacts.dirty.length - before }
  })
  check('a clean reload adopts host notes without becoming dirty', (await notes.inputValue()) === 'Host clean' && !clean.dirty && clean.events === 0)
  const forgedHostNotes = await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    const deck = player.controller.state.deck
    const forged = Object.defineProperty(
      { ...deck, slides: deck.slides.map((slide) => ({ ...slide, notes: 'Host notes with old symbol' })) },
      Symbol.for('@segnavia/frame/internal-deck-input'),
      { value: true },
    )
    await player.controller.load(forged)
    return (player.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null)?.value
  })
  check('a host deck carrying the old provenance symbol still adopts its notes', forgedHostNotes === 'Host notes with old symbol', forgedHostNotes)
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = true))
  await notes.fill('Local reload draft')
  await page.evaluate(() => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    const deck = player.controller.state.deck
    ;(window as unknown as { notesReload: Promise<void> }).notesReload = player.controller.load({
      ...deck,
      slides: deck.slides.map((slide) => ({ ...slide, notes: 'Host during edit' })),
    })
  })
  await page.waitForFunction(() =>
    (window as unknown as { authoringFacts: { saves: Array<{ notes: string }> } }).authoringFacts.saves.some((save) => save.notes === 'Local reload draft'),
  )
  await page.evaluate(() => (window as unknown as { authoringFacts: { releaseNotes(): void } }).authoringFacts.releaseNotes())
  await page.evaluate(() => (window as unknown as { notesReload: Promise<void> }).notesReload)
  const local = await notes.inputValue()
  await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    const deck = player.controller.state.deck
    await player.controller.load({ ...deck, slides: deck.slides.map((slide) => ({ ...slide, notes: 'Host after settle' })) })
  })
  check(
    'a reload preserves local work once, then adopts host notes after it settles',
    local === 'Local reload draft' && (await notes.inputValue()) === 'Host after settle',
    JSON.stringify({ local, settled: await notes.inputValue() }),
  )
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = false))
  await notes.fill('Draft before refused reload')
  const afterRefusal = await page.evaluate(async () => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    await player.controller.load({}).catch(() => {})
    const deck = player.controller.state.deck
    await player.controller.load({ ...deck, slides: deck.slides.map((slide) => ({ ...slide, notes: 'Host after refused reload' })) })
    return (player.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null)?.value ?? ''
  })
  check('a refused reload does not preserve local notes into the next host reload', afterRefusal === 'Host after refused reload', afterRefusal)
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = true))
  await notes.fill('Pending during reorder')
  await page.evaluate(() => {
    const holder = window as unknown as { authoring: { move(fromIndex: number, toIndex: number): Promise<void> }; authoringMove?: Promise<void> }
    holder.authoringMove = holder.authoring.move(0, 1)
  })
  await page.waitForFunction(() =>
    (window as unknown as { authoringFacts: { saves: Array<{ notes: string }> } }).authoringFacts.saves.some((save) => save.notes === 'Pending during reorder'),
  )
  await page.evaluate(() => {
    const player = document.querySelector('segnavia-player') as HTMLElement & {
      controller: { load(input: unknown): Promise<void>; state: { deck: { slides: Array<Record<string, unknown>> } } }
    }
    const deck = player.controller.state.deck
    ;(window as unknown as { concurrentHostLoad: Promise<void> }).concurrentHostLoad = player.controller.load({
      ...deck,
      slides: deck.slides.map((slide) => ({ ...slide, notes: 'Concurrent host notes' })),
    })
  })
  await page.evaluate(() => (window as unknown as { authoringFacts: { releaseNotes(): void } }).authoringFacts.releaseNotes())
  await page.evaluate(() => {
    const holder = window as unknown as { concurrentHostLoad: Promise<void>; authoringMove: Promise<void> }
    return Promise.all([holder.concurrentHostLoad, holder.authoringMove])
  })
  check('a host reload during an optimistic reorder adopts host notes', (await notes.inputValue()) === 'Concurrent host notes', await notes.inputValue())
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = false))
  await notes.fill('Detached draft')
  const detached = await page.evaluate(async () => {
    const holder = window as unknown as { authoring: { detach(): Promise<void> }; authoringFacts: { saves: Array<{ notes: string }> } }
    const saving = holder.authoring.detach()
    document.querySelector('segnavia-player')?.remove()
    await saving
    return holder.authoringFacts.saves.at(-1)?.notes
  })
  check('removing a player within the debounce still saves its notes', detached === 'Detached draft', detached)
}

export async function verifyRailAuthoring(h: Harness) {
  const { page, check } = h
  for (const width of [1280, 360]) {
    const flow = await playerGeometry(h, 'flow.html', width)
    check(
      `a default ${width}px player contains its 16:9 slide in the available screen`,
      flow.stage.width <= flow.screen.width + 2 &&
        flow.stage.height <= flow.screen.height + 2 &&
        Math.abs(flow.stage.width / flow.stage.height - 16 / 9) < 0.01,
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
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = true))
  await notes.fill('Track draft')
  const track = page.locator(`${PLAYER} segnavia-track ol`)
  const trackBox = await track.boundingBox()
  if (!trackBox) throw new Error('The authoring continuous track has no box.')
  await page.mouse.click(trackBox.x + trackBox.width * 0.75, trackBox.y + trackBox.height / 2)
  await page.waitForTimeout(50)
  const beforeTrackSave = (await h.state(PLAYER)).slide
  await page.evaluate(() => (window as unknown as { authoringFacts: { releaseNotes(): void } }).authoringFacts.releaseNotes())
  await h.waitFor(PLAYER, (data) => data.slide === '2')
  check('a continuous track seek waits for the pending notes save', beforeTrackSave === '1' && (await h.state(PLAYER)).slide === '2', beforeTrackSave)
  await page.evaluate(() => {
    const holder = window as unknown as {
      authoringFacts: { deferNotes: boolean }
    }
    holder.authoringFacts.deferNotes = false
    return (document.querySelector('segnavia-player') as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(0)
  })
  await h.waitFor(PLAYER, (data) => data.slide === '1')
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

  await page.goto(h.url('authoring.html'))
  await page.waitForFunction(() => 'authoring' in window)
  const serializedNotes = page.locator(`${PLAYER} textarea[part="notes-editor"]`)
  await page.evaluate(() => ((window as unknown as { authoringFacts: { deferNotes: boolean } }).authoringFacts.deferNotes = true))
  await serializedNotes.fill('Pending removal')
  const serializedUpdate = await page.evaluate(async () => {
    const holder = window as unknown as {
      authoring: {
        update(handlers: { saveNotes?: (input: { notes: string }) => Promise<void> }, options?: { notesMaxLength?: number }): Promise<void>
      }
      authoringFacts: { releaseNotes(): void }
      serializedSaves?: string[]
    }
    const removing = holder.authoring.update({})
    await Promise.resolve()
    holder.serializedSaves = []
    const readding = holder.authoring.update(
      {
        saveNotes: async ({ notes }) => {
          holder.serializedSaves?.push(notes)
        },
      },
      { notesMaxLength: 4321 },
    )
    holder.authoringFacts.releaseNotes()
    await Promise.all([removing, readding])
    const field = document.querySelector('segnavia-player')?.shadowRoot?.querySelector('textarea') as HTMLTextAreaElement | null
    return { attached: Boolean(field), text: field?.value, maxLength: field?.maxLength }
  })
  if (serializedUpdate.attached) {
    await serializedNotes.fill('Newest handler')
    await page.waitForTimeout(700)
  }
  const serializedSaves = await page.evaluate(() => (window as unknown as { serializedSaves?: string[] }).serializedSaves ?? [])
  check(
    'remove then re-add during a flush keeps notes attached with the newest handler',
    serializedUpdate.attached &&
      serializedUpdate.text === 'Pending removal' &&
      serializedUpdate.maxLength === 4321 &&
      serializedSaves.join(',') === 'Newest handler',
    JSON.stringify({ ...serializedUpdate, serializedSaves }),
  )

  await verifyReloadedNotes(h)
  await verifyReactAuthoring(h)

  const playerBundle = readFileSync(path.join(SITE, 'segnavia-player.js'), 'utf8')
  const controlsBundle = readFileSync(path.join(SITE, 'segnavia-controls.js'), 'utf8')
  check('viewer bundles contain no authoring layer', !playerBundle.includes('attachAuthoring') && !controlsBundle.includes('attachAuthoring'))
  await page.setViewportSize({ width: 1280, height: 816 })
}
