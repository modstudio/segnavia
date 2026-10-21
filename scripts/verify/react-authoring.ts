import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

export async function verifyReactAuthoring(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('react.html'))
  await page.waitForFunction(() => 'reactMount' in window)
  await page.evaluate(() => (window as unknown as { reactMount(): void }).reactMount())
  await page.waitForFunction(() => document.querySelector('segnavia-player'))
  await page.waitForFunction(() => {
    const holder = window as unknown as { reactAuthoring?: unknown; reactDeckController?: unknown }
    const player = document.querySelector('segnavia-player') as HTMLElement & { controller?: unknown }
    return Boolean(player?.shadowRoot?.querySelector('[data-authoring-notes]')) && holder.reactAuthoring && holder.reactDeckController === player?.controller
  })
  const notes = page.locator(`${PLAYER} textarea[part="notes-editor"]`)
  await notes.fill('Strict replacement draft')
  await page.evaluate(() => {
    const holder = window as unknown as { reactAuthoring?: unknown; reactOldAuthoring?: unknown; reactReplaceAuthoring(): void }
    holder.reactOldAuthoring = holder.reactAuthoring
    holder.reactReplaceAuthoring()
  })
  await page.waitForFunction(() => {
    const holder = window as unknown as { reactAuthoring?: unknown; reactOldAuthoring?: unknown }
    return holder.reactAuthoring !== holder.reactOldAuthoring
  })
  const strictModeMount = await page.evaluate(() => {
    const facts = (window as unknown as { reactFacts: { notesRoots: number[] } }).reactFacts
    return { current: document.querySelector('segnavia-player')?.shadowRoot?.querySelectorAll('[data-authoring-notes]').length, seen: facts.notesRoots }
  })
  await page.evaluate(() => window.dispatchEvent(new Event('react-release-replacement')))
  await page.waitForTimeout(0)
  check(
    'React hooks attach once when the player mounts under StrictMode',
    strictModeMount.current === 1 && !strictModeMount.seen.includes(2) && (await notes.isVisible()),
    JSON.stringify(strictModeMount),
  )
  await page.evaluate(() => ((window as unknown as { reactFacts: { saves: string[] } }).reactFacts.saves.length = 0))
  await page.evaluate(() => {
    const holder = window as unknown as { reactSetTimeout?: typeof setTimeout }
    holder.reactSetTimeout = window.setTimeout
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === 600) return 2_147_000_000
      return holder.reactSetTimeout?.(handler, delay, ...args) ?? 0
    }) as typeof setTimeout
  })
  await notes.fill('Strict mode navigation draft')
  const navigationSaves = await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { next(): Promise<void> } }) => {
    const facts = (window as unknown as { reactFacts: { saves: string[] } }).reactFacts
    await player.controller.next()
    return [...facts.saves]
  })
  await page.evaluate(() => {
    const holder = window as unknown as { reactSetTimeout?: typeof setTimeout }
    if (holder.reactSetTimeout) window.setTimeout = holder.reactSetTimeout
  })
  check('React StrictMode replacement keeps the navigation save guard', navigationSaves.includes('Strict mode navigation draft'), navigationSaves.join(','))
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { previous(): Promise<void> } }) => player.controller.previous())
  await page.evaluate(() => ((window as unknown as { reactFacts: { saves: string[] } }).reactFacts.saves.length = 0))
  await page.evaluate(() => (window as unknown as { reactSetRail(value: boolean): void }).reactSetRail(true))
  await page.waitForFunction(() => document.querySelector('segnavia-player')?.hasAttribute('rail'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  const reactLabel = await page.locator(`${PLAYER} .player`).getAttribute('aria-label')
  check(
    'React renders the player and applies a later prop update',
    reactLabel === 'React player' && (await page.locator(PLAYER).getAttribute('rail')) === '',
    reactLabel ?? '',
  )
  await page.locator('#react-thumbnail').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelector('#react-thumbnail')?.shadowRoot?.querySelectorAll('iframe').length === 1)
  const wrappers = await page.locator('#react-page,#react-thumbnail,#react-paper').evaluateAll((elements) =>
    elements.map((element) => ({ tag: element.localName, frames: (element.shadowRoot ?? element).querySelectorAll('iframe').length })),
  )
  await page.locator('#react-document').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelectorAll('#react-document iframe').length === 1)
  wrappers.push(await page.locator('#react-document').evaluate((element) => ({ tag: element.localName, frames: element.querySelectorAll('iframe').length })))
  check(
    'React Page, Paper, and Document wrappers assign object properties and render sandboxed frames',
    wrappers.map(({ tag }) => tag).join(',') === 'segnavia-page,segnavia-thumbnail,segnavia-paper,segnavia-document' && wrappers.every(({ frames }) => frames === 1),
    JSON.stringify(wrappers),
  )
  await page.locator('#react-thumbnail').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelector('#react-thumbnail')?.shadowRoot?.querySelectorAll('iframe').length === 1)
  await page.evaluate(() => (window as unknown as { reactSetWrapperObjects(value: number): void }).reactSetWrapperObjects(1))
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#react-page iframe,#react-document iframe').length === 0 &&
      document.querySelector('#react-thumbnail')?.shadowRoot?.querySelectorAll('iframe').length === 0 &&
      !(document.querySelector('#react-thumbnail') as HTMLElement).style.getPropertyValue('--segnavia-aspect') &&
      !(document.querySelector('#react-document') as HTMLElement).style.getPropertyValue('--segnavia-document-paper-aspect'),
  )
  await page.evaluate(() => (window as unknown as { reactSetWrapperObjects(value: number): void }).reactSetWrapperObjects(2))
  await page.waitForFunction(
    () =>
      document.querySelectorAll('#react-page iframe').length === 1 &&
      document.querySelector('#react-thumbnail')?.shadowRoot?.querySelectorAll('iframe').length === 1,
  )
  await page.locator('#react-document').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelectorAll('#react-document iframe').length === 1)
  check('React Page, Thumbnail, and Document wrappers clear and replace their object props on rerender', true)
  await notes.fill('React draft')
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
  const oldPlayer = await page.locator(PLAYER).elementHandle()
  await page.evaluate(() => (window as unknown as { reactReplace(): void }).reactReplace())
  const replacementFacts = () =>
    page.evaluate((oldPlayer) => {
      const holder = window as unknown as { reactDeckController?: unknown }
      const newPlayer = document.querySelector('segnavia-player')
      return {
        replaced: Boolean(oldPlayer && newPlayer && oldPlayer !== newPlayer),
        oldDetached: oldPlayer?.shadowRoot?.querySelector('[data-authoring-notes]') === null,
        newAttached: Boolean(newPlayer?.shadowRoot?.querySelector('[data-authoring-notes]')),
        controllerFollowed: holder.reactDeckController === (newPlayer as unknown as { controller?: unknown })?.controller,
      }
    }, oldPlayer)
  const followed = (facts: Awaited<ReturnType<typeof replacementFacts>>) => facts.replaced && facts.oldDetached && facts.newAttached && facts.controllerFollowed
  const deadline = Date.now() + BOUNDED_WAIT_MS
  let replacement = await replacementFacts()
  while (!followed(replacement) && Date.now() < deadline) {
    await page.waitForTimeout(50)
    replacement = await replacementFacts()
  }
  check('React keyed replacement follows the new player', followed(replacement), JSON.stringify(replacement))
  await page.locator(`${PLAYER} textarea[part="notes-editor"]`).fill('Unmounted React draft')
  const unmountedPlayer = await page.locator(PLAYER).elementHandle()
  await page.evaluate(() => (window as unknown as { reactUnmount(): void }).reactUnmount())
  await page.waitForFunction(() => (window as unknown as { reactFacts: { saves: string[] } }).reactFacts.saves.includes('Unmounted React draft'))
  const detached = await unmountedPlayer?.evaluate((player) => player.shadowRoot?.querySelector('[data-authoring-notes]') === null)
  check('React unmount detaches authoring and saves a pending edit', detached === true)
}
