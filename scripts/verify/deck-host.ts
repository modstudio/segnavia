import { inflateSync } from 'node:zlib'
import { neighborTurnFacts } from './deck-host-waits.ts'
import { verifyDeckTransitions } from './deck-transitions.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const STAGE = '#deck'

export async function verifyDeckHost(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('deck-host.html'))
  await h.waitFor(STAGE, (data) => data.slide === '1')
  await page.waitForFunction(() => document.querySelectorAll('#deck iframe').length === 2)
  check('deck host: a 40-slide first window mounts two frames', (await page.locator(`${STAGE} iframe`).count()) === 2)

  const turn = await neighborTurnFacts(h)
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
  await h.waitFor('#deck-root', (data) => data.presenting === undefined, { timeout: BOUNDED_WAIT_MS })
  const pageExit = await page.evaluate(() => ({
    restored: document.body.style.overflow,
    ended: !document.querySelector('#deck-root')?.hasAttribute('data-presenting'),
  }))
  await page.locator('#present').click()
  await h.clickFrame(`${STAGE} [data-active] iframe`)
  await page.keyboard.press('Escape')
  await h.waitFor('#deck-root', (data) => data.presenting === undefined, { timeout: BOUNDED_WAIT_MS })
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

  const pendingCss = await page.evaluate(async () => {
    const host = (
      window as unknown as {
        __deckHost: { controller: { go(index: number): Promise<void> }; setCss(css: string): Promise<void> }
      }
    ).__deckHost
    await host.controller.go(1)
    const firstIncoming = document.querySelector<HTMLElement>('#deck [data-incoming]')
    await host.setCss('h1{background:rgb(34, 197, 94)}')
    const replacement = document.querySelector<HTMLElement>('#deck [data-incoming]')
    return { firstRemoved: Boolean(firstIncoming) && !firstIncoming?.isConnected, replaced: Boolean(replacement) && replacement !== firstIncoming }
  })
  await page.waitForFunction(() => document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'sandboxed-2')
  const pendingBackground = await page
    .frameLocator(`${STAGE} [data-active] iframe`)
    .locator('h1')
    .evaluate((heading) => getComputedStyle(heading).backgroundColor)
  check(
    'deck host: changed css rebuilds an incoming frame during a pending swap',
    pendingCss.firstRemoved && pendingCss.replaced && pendingBackground === 'rgb(34, 197, 94)',
    JSON.stringify({ ...pendingCss, background: pendingBackground }),
  )

  const turnDurations: number[] = []
  const pixels: Array<[number, number, number]> = []
  await captureSandboxedTurns(h, turnDurations, pixels)
  const bare = pixels.filter(([red, green, blue]) => Math.abs(red - 238) < 3 && Math.abs(green - 238) < 3 && Math.abs(blue - 238) < 3)
  const sampled = await sampleSandboxedTurns(h)
  const sandboxedCount = await page.locator(`${STAGE} iframe`).count()
  check(
    'deck host: every parent animation frame stays loaded and painted across sandboxed turns',
    pixels.length >= 6 && bare.length === 0 && sampled.badFrames === 0 && sampled.turns >= 6 && sampled.frames > sampled.turns && sampled.timedOut === false,
    JSON.stringify({ captures: pixels.length, bare: bare.length, ...sampled, turnDurations }),
  )
  check(
    'deck host: a rapid second turn cancels the first incoming frame and retains no neighbor',
    sampled.cancelled && sampled.target === 'sandboxed-1' && sandboxedCount === 1,
    JSON.stringify({ cancelled: sampled.cancelled, target: sampled.target, sandboxedCount }),
  )

  await verifyDeckTransitions(h)

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
    durations.push(performance.now() - started)
    pixels.push(await stageCenterPixel(h), await stageCenterPixel(h))
  }
}

interface SampledTurns {
  frames: number
  badFrames: number
  turns: number
  cancelled: boolean
  target: string | null
  timedOut: boolean
}

async function sampleSandboxedTurns(h: Harness): Promise<SampledTurns> {
  return h.page.evaluate(async (boundedWaitMs) => {
    const stage = document.querySelector('#deck') as HTMLElement & { controller: { go(index: number): Promise<void> } }
    const deadline = performance.now() + boundedWaitMs
    const loaded = new WeakSet<Element>()
    const watch = (canvas: Element) => {
      const media = canvas.querySelector('iframe, img')
      if (media) media.addEventListener('load', () => loaded.add(media), { once: true })
    }
    const activeMedia = stage.querySelector('[data-active] iframe, [data-active] img')
    if (activeMedia) loaded.add(activeMedia)
    const observer = new MutationObserver((records) => {
      const added = records.flatMap((record) => [...record.addedNodes]).filter((node): node is Element => node instanceof Element)
      for (const node of added) {
        if (node.matches('.segnavia-stage__canvas')) watch(node)
        for (const canvas of node.querySelectorAll('.segnavia-stage__canvas')) watch(canvas)
      }
    })
    observer.observe(stage, { childList: true, subtree: true })

    let frames = 0
    let badFrames = 0
    let sampling = true
    const sample = () => {
      if (!sampling) return
      frames++
      const visible = [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].filter((canvas) => {
        const style = getComputedStyle(canvas)
        return style.opacity === '1' && style.display !== 'none' && style.visibility !== 'hidden' && !canvas.hidden
      })
      const media = visible[0]?.querySelector('iframe, img')
      if (visible.length !== 1 || !media || !loaded.has(media)) badFrames++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const waitForActive = (id: string) =>
      new Promise<boolean>((resolve) => {
        const poll = () => {
          if (stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === id) resolve(true)
          else if (performance.now() >= deadline) resolve(false)
          else requestAnimationFrame(poll)
        }
        poll()
      })
    const waitWithinBound = (promise: Promise<void>) => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) return Promise.resolve(false)
      return Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), remaining))])
    }
    const go = async (index: number) => {
      if (!(await waitWithinBound(stage.controller.go(index)))) return false
      if (!(await waitForActive(`sandboxed-${index + 1}`))) return false
      return waitWithinBound(settle())
    }
    let completed = true
    for (const index of [1, 2, 1, 0, 1]) {
      completed = await go(index)
      if (!completed) break
    }
    if (completed) completed = await waitWithinBound(stage.controller.go(2))
    const firstIncoming = completed ? stage.querySelector<HTMLElement>('[data-slide-id="sandboxed-3"]') : null
    if (completed) completed = await waitWithinBound(stage.controller.go(0))
    if (completed) completed = await waitForActive('sandboxed-1')
    if (completed) completed = await waitWithinBound(settle())
    sampling = false
    observer.disconnect()
    const active = stage.querySelector<HTMLElement>('[data-active]')
    return {
      frames,
      badFrames,
      turns: 7,
      cancelled: Boolean(firstIncoming) && !firstIncoming?.isConnected && !stage.querySelector('[data-slide-id="sandboxed-3"]'),
      target: active?.dataset.slideId ?? null,
      timedOut: !completed,
    }
  }, BOUNDED_WAIT_MS)
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
