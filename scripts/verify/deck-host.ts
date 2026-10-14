import type { Harness } from './harness.ts'

const STAGE = '#deck'

export async function verifyDeckHost(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('deck-host.html'))
  await h.waitFor(STAGE, (data) => data.slide === '1')
  await page.waitForFunction(() => document.querySelectorAll('#deck iframe').length === 2)
  check('deck host: a 40-slide first window mounts two frames', (await page.locator(`${STAGE} iframe`).count()) === 2)

  const turn = await page.evaluate(async () => {
    const stage = document.querySelector('#deck') as HTMLElement & { controller: { go(index: number): Promise<void> } }
    const next = stage.querySelector('[data-slide-id="slide-2"] iframe') as HTMLIFrameElement
    next.dataset.identity = 'kept'
    const srcdoc = next.srcdoc
    await stage.controller.go(1)
    return {
      count: stage.querySelectorAll('iframe').length,
      same: stage.querySelector('[data-active] iframe') === next && next.dataset.identity === 'kept' && next.srcdoc === srcdoc,
    }
  })
  check('deck host: a turn reveals the unchanged neighbor frame and mounts three', turn.same && turn.count === 3, JSON.stringify(turn))

  const reorder = await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { ids: string[]; reload(ids: string[], edits?: Record<string, string>): Promise<void> } }).__deckHost
    const active = document.querySelector('#deck [data-active] iframe') as HTMLIFrameElement
    active.dataset.reorderIdentity = 'kept'
    await host.reload(['slide-2', ...host.ids.filter((id) => id !== 'slide-2')])
    const same = document.querySelector('#deck [data-active] iframe') === active && active.dataset.reorderIdentity === 'kept'
    const beforeEdit = document.querySelector<HTMLIFrameElement>('#deck [data-active] iframe')
    await host.reload(host.ids, { 'slide-2': '-edited' })
    const afterEdit = document.querySelector<HTMLIFrameElement>('#deck [data-active] iframe')
    const replaced = afterEdit !== beforeEdit && Boolean(afterEdit?.srcdoc.includes('slide-2-edited'))
    await host.reload(['slide-1'])
    return { same, replaced, counter: document.querySelector('#counter')?.textContent }
  })
  check(
    'deck host: reorder keeps unchanged frames, edits replace frames, and shrinking clamps the counter',
    reorder.same && reorder.replaced && reorder.counter === '1 / 1',
    JSON.stringify(reorder),
  )

  await page.goto(h.url('deck-host.html?slides=30#slide-30'))
  await h.waitFor(STAGE, (data) => data.slide === '30')
  check('deck host: #slide-30 opens slide 30 directly', (await h.state(STAGE)).slide === '30')
  await page.goto(h.url('deck-host.html?slides=30#slide-40'))
  await h.waitFor(STAGE, (data) => data.slide === '30')
  await page.evaluate(() => {
    location.hash = '#slide-4'
  })
  await h.waitFor(STAGE, (data) => data.slide === '4')
  check('deck host: clamped and live slide hashes navigate', (await h.state(STAGE)).slide === '4')

  await page.keyboard.press('ArrowRight')
  await h.waitFor(STAGE, (data) => data.slide === '5')
  const hidden = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('#deck [aria-hidden="true"]')
    return { inert: canvas?.inert === true, slide: document.querySelector<HTMLElement>('#deck')?.dataset.slide }
  })
  await page
    .locator(`${STAGE} [aria-hidden="true"] iframe`)
    .first()
    .contentFrame()
    .locator('body')
    .evaluate(() => {
      parent.postMessage({ type: 'segnavia:key', key: 'ArrowRight' }, '*')
    })
  await page.waitForTimeout(100)
  const afterHiddenRelay = (await h.state(STAGE)).slide
  await page.locator('#notes').focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const afterInput = (await h.state(STAGE)).slide
  await h.clickFrame(`${STAGE} [data-active] iframe`)
  await page.keyboard.press('ArrowRight')
  await h.waitFor(STAGE, (data) => data.slide === '6')
  await page.keyboard.press(' ')
  await page.waitForTimeout(100)
  check(
    'deck host: page arrows, inert neighbors, relay filtering, form exclusion and ignored Space hold',
    hidden.inert && hidden.slide === '5' && afterHiddenRelay === '5' && afterInput === '5' && (await h.state(STAGE)).slide === '6',
  )

  await page.locator('#present').click()
  const presentation = await page.evaluate(() => ({
    marked: document.querySelector('#deck-root')?.hasAttribute('data-presenting'),
    overflow: document.body.style.overflow,
  }))
  await page.locator('#notes').dispatchEvent('keydown', { key: 'Escape' })
  const pageExit = await page.evaluate(() => ({
    restored: document.body.style.overflow,
    ended: !document.querySelector('#deck-root')?.hasAttribute('data-presenting'),
  }))
  await page.locator('#present').click()
  await h.clickFrame(`${STAGE} [data-active] iframe`)
  await page.keyboard.press('Escape')
  const relayEnded = await page.evaluate(() => !document.querySelector('#deck-root')?.hasAttribute('data-presenting'))
  await page.locator('#present').click()
  const removedOverflow = await page.evaluate(() => {
    document.querySelector('#deck')?.remove()
    return document.body.style.overflow
  })
  const indexBeforeDetachedKey = await page.evaluate(
    () => (window as unknown as { __deckHost: { controller: { state: { index: number } } } }).__deckHost.controller.state.index,
  )
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(100)
  const indexAfterDetachedKey = await page.evaluate(
    () => (window as unknown as { __deckHost: { controller: { state: { index: number } } } }).__deckHost.controller.state.index,
  )
  check(
    'deck host: window presentation marks, locks, exits and restores on removal',
    presentation.marked === true &&
      presentation.overflow === 'hidden' &&
      pageExit.ended === true &&
      pageExit.restored === '' &&
      relayEnded &&
      removedOverflow === '' &&
      indexAfterDetachedKey === indexBeforeDetachedKey,
    JSON.stringify({ ...presentation, ...pageExit, relayEnded, removedOverflow, indexBeforeDetachedKey, indexAfterDetachedKey }),
  )

  await page.setViewportSize({ width: 1280, height: 816 })
  await page.goto(h.url('deck-host.html'))
  await h.waitFor(STAGE, (data) => data.slide === '1')
  const desk = await fitFacts(h)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(200)
  const phone = await fitFacts(h)
  check('deck host: viewport fit stays within desk and phone windows and reports width', desk.ok && phone.ok, JSON.stringify({ desk, phone }))

  const titles = await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { ids: string[]; reload(ids: string[]): Promise<void> } }).__deckHost
    const before = [...document.querySelectorAll<HTMLIFrameElement>('#deck iframe')].map((frame) => frame.title)
    await host.reload(['slide-2', 'slide-1', ...host.ids.slice(2)])
    const moved = document.querySelector<HTMLIFrameElement>('#deck [data-slide-id="slide-1"] iframe')?.title
    return { before, moved }
  })
  check(
    'deck host: frame titles name deck positions and update after reorder',
    titles.before.includes('Window deck — slide 1') && titles.moved === 'Window deck — slide 2',
    JSON.stringify(titles),
  )

  const documentFacts = await page.locator(`${STAGE} [data-active] iframe`).evaluate((frame: HTMLIFrameElement) => ({
    nonce: /script-src 'nonce-[0-9a-f]{32}'/.test(frame.srcdoc),
    bridge: frame.srcdoc.includes('segnavia:key'),
  }))
  const authorColor = await page
    .frameLocator(`${STAGE} [data-active] iframe`)
    .locator('h1')
    .evaluate((heading) => getComputedStyle(heading).color)
  check(
    'deck host: author CSS follows host CSS and the refused-script bridge has a nonce',
    authorColor === 'rgb(0, 128, 0)' && documentFacts.nonce && documentFacts.bridge,
    JSON.stringify({ authorColor, ...documentFacts }),
  )

  await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { focusNeighbor(): Promise<void> } }).__deckHost
    await host.focusNeighbor()
    document.querySelector<HTMLTextAreaElement>('#notes')?.focus()
  })
  await page.waitForTimeout(300)
  const guardedFocus = await page.evaluate(() => {
    const active = document.activeElement
    const hiddenFrame = document.querySelector<HTMLIFrameElement>('#deck [aria-hidden="true"] iframe')
    return active !== hiddenFrame && active === document.querySelector('#deck')
  })
  await page.locator('#notes').focus()
  await page.keyboard.type(' receives typed keys')
  const notesValue = await page.locator('#notes').inputValue()
  check(
    'deck host: a scripted hidden neighbor cannot retain focus or intercept page typing',
    guardedFocus && notesValue === 'Notes stay editable receives typed keys',
    JSON.stringify({ guardedFocus, notesValue }),
  )
  await page.setViewportSize({ width: 1280, height: 816 })
}

async function fitFacts(h: Harness) {
  return h.page.evaluate(() => {
    const stage = document.querySelector('#deck') as HTMLElement & { fitted: { width: number; height: number } | null }
    const canvas = stage.querySelector('[data-active]') as HTMLElement
    const box = canvas.getBoundingClientRect()
    const fitted = stage.fitted
    return {
      ok:
        Boolean(fitted) &&
        box.right <= window.innerWidth + 1 &&
        box.bottom <= window.innerHeight + 1 &&
        document.documentElement.scrollWidth <= window.innerWidth &&
        document.documentElement.scrollHeight <= window.innerHeight &&
        Math.abs((fitted?.width ?? 0) - box.width) < 1,
      fitted,
      box: { width: box.width, height: box.height, right: box.right, bottom: box.bottom },
      scroll: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    }
  })
}
