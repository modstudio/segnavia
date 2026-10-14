import { inflateSync } from 'node:zlib'
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
    const host = (window as unknown as { __deckHost: { loadSandboxed(): Promise<void> } }).__deckHost
    await host.loadSandboxed()
  })
  await page.waitForFunction(() => document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'sandboxed-1')
  const beforePolicy = page.locator(`${STAGE} [data-active] iframe`)
  const sandboxedFrame = await beforePolicy.elementHandle()
  const ranBefore = (await beforePolicy.contentFrame().locator('h1').textContent())?.endsWith('-script-ran') === true
  await page.evaluate(() => {
    location.hash = '#kept-by-host'
  })
  await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { loadScripts(scripts: 'refuse' | 'sandboxed'): Promise<void> } }).__deckHost
    await host.loadScripts('refuse')
  })
  await page.waitForFunction((frame) => document.querySelector('#deck [data-active] iframe') !== frame, sandboxedFrame)
  const refusedFrame = page.locator(`${STAGE} [data-active] iframe`)
  const ranRefused = (await refusedFrame.contentFrame().locator('h1').textContent())?.endsWith('-script-ran') === true
  const refusedFacts = await page.evaluate(() => ({
    slide: document.querySelector<HTMLElement>('#deck')?.dataset.slide,
    hash: location.hash,
  }))
  const refusedHandle = await refusedFrame.elementHandle()
  await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { loadScripts(scripts: 'refuse' | 'sandboxed'): Promise<void> } }).__deckHost
    await host.loadScripts('sandboxed')
  })
  await page.waitForFunction((frame) => document.querySelector('#deck [data-active] iframe') !== frame, refusedHandle)
  const ranAgain = (await page.frameLocator(`${STAGE} [data-active] iframe`).locator('h1').textContent())?.endsWith('-script-ran') === true
  check(
    'deck host: scripts policy changes rebuild while preserving the selected slide and hash',
    ranBefore && !ranRefused && ranAgain && refusedFacts.slide === '1' && refusedFacts.hash === '#kept-by-host',
    JSON.stringify({ ranBefore, ranRefused, ranAgain, ...refusedFacts }),
  )

  const frameBeforeCss = await page.locator(`${STAGE} [data-active] iframe`).elementHandle()
  await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { setCss(css: string): Promise<void> } }).__deckHost
    await host.setCss('h1{background:rgb(250, 204, 21)}')
  })
  await page.waitForFunction((frame) => document.querySelector('#deck [data-active] iframe') !== frame, frameBeforeCss)
  const cssFacts = {
    replaced: (await page.locator(`${STAGE} [data-active] iframe`).elementHandle()) !== frameBeforeCss,
    background: await page
      .frameLocator(`${STAGE} [data-active] iframe`)
      .locator('h1')
      .evaluate((heading) => getComputedStyle(heading).backgroundColor),
  }
  check('deck host: changed host css rebuilds the current frame', cssFacts.replaced && cssFacts.background === 'rgb(250, 204, 21)', JSON.stringify(cssFacts))

  const turnDurations: number[] = []
  const pixels: Array<[number, number, number]> = []
  await captureSandboxedTurns(h, turnDurations, pixels)
  const sandboxedCount = await page.locator(`${STAGE} iframe`).count()
  const bare = pixels.filter(([red, green, blue]) => Math.abs(red - 238) < 3 && Math.abs(green - 238) < 3 && Math.abs(blue - 238) < 3)
  check(
    'deck host: tight per-frame captures stay painted and sandboxed decks retain no neighbor',
    pixels.length >= 6 && bare.length === 0 && sandboxedCount === 1,
    JSON.stringify({ captures: pixels.length, bare: bare.length, sandboxedCount, turnDurations }),
  )

  await page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: { loadHeld(): Promise<void> } }).__deckHost
    await host.loadHeld()
  })
  const timeoutStarted = performance.now()
  await page.evaluate(() => {
    const host = (window as unknown as { __deckHost: { controller: { go(index: number): Promise<void> } } }).__deckHost
    void host.controller.go(1)
  })
  await page.waitForFunction(() => document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'held', undefined, { timeout: 2000 })
  const timeoutElapsed = performance.now() - timeoutStarted
  const timeoutCount = await page.locator(`${STAGE} iframe`).count()
  check(
    'deck host: a frame whose load never fires swaps after the turn timeout',
    timeoutElapsed >= 200 && timeoutElapsed < 1000 && timeoutCount === 1,
    JSON.stringify({ timeoutElapsed, timeoutCount }),
  )
  await page.setViewportSize({ width: 1280, height: 816 })
}

async function captureSandboxedTurns(h: Harness, durations: number[], pixels: Array<[number, number, number]>) {
  for (const [index, id] of [
    [1, 'sandboxed-2'],
    [2, 'sandboxed-3'],
  ] as const) {
    const started = performance.now()
    await h.page.evaluate((target) => {
      const host = (window as unknown as { __deckHost: { controller: { go(index: number): Promise<void> } } }).__deckHost
      void host.controller.go(target)
    }, index)
    let active = ''
    while (active !== id) {
      pixels.push(await stageCenterPixel(h))
      active = (await h.page.locator(`${STAGE} [data-active]`).getAttribute('data-slide-id')) ?? ''
    }
    pixels.push(await stageCenterPixel(h), await stageCenterPixel(h))
    durations.push(performance.now() - started)
  }
}

async function stageCenterPixel(h: Harness): Promise<[number, number, number]> {
  const box = await h.page.locator(STAGE).boundingBox()
  if (!box) throw new Error('The deck stage has no box.')
  return screenshotPixel(await h.page.screenshot({ clip: { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 1, height: 1 } }))
}

function screenshotPixel(png: Uint8Array): [number, number, number] {
  let offset = 8
  const compressed: Uint8Array[] = []
  while (offset < png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const row = inflateSync(Buffer.concat(compressed))
  return [row[1] ?? 0, row[2] ?? 0, row[3] ?? 0]
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
