import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = 'segnavia-player'

interface Geometry {
  player: { width: number; height: number }
  stage: { top: number; right: number; bottom: number; left: number; width: number; height: number }
  rail: { top: number; right: number; bottom: number; left: number; width: number; height: number }
  bar: { top: number; right: number; bottom: number; left: number; opacity: string }
}

async function geometry(h: Harness): Promise<Geometry> {
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    const bar = root.querySelector('.bar') as HTMLElement
    const barBox = box(bar)
    return {
      player: box(player),
      stage: box(root.querySelector('segnavia-stage') as HTMLElement),
      rail: box(root.querySelector('segnavia-rail') as HTMLElement),
      bar: { ...barBox, opacity: getComputedStyle(bar).opacity },
    }
  })
}

async function waitForBarOpacity(h: Harness, expected: '0' | '1'): Promise<Geometry> {
  const deadline = Date.now() + BOUNDED_WAIT_MS
  let boxes = await geometry(h)
  while (boxes.bar.opacity !== expected && Date.now() < deadline) {
    await h.page.waitForTimeout(Math.max(0, Math.min(50, deadline - Date.now())))
    boxes = await geometry(h)
  }
  return boxes
}

export async function verifyPlayerLayout(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await page.waitForFunction(() => {
    const player = document.querySelector('segnavia-player')
    const bar = player?.shadowRoot?.querySelector('.bar')
    return bar ? bar.getBoundingClientRect().bottom <= window.innerHeight : false
  })
  let boxes = await geometry(h)
  check('contain keeps the control bar within a 1280 by 720 viewport', boxes.bar.bottom <= 720, JSON.stringify(boxes))
  await h.evidence('player-contain-1280x720.png')

  // A host header above the player: contain sizes from the viewport, never from
  // where the player happens to sit, so the stage must match the unspaced size.
  const atTop = boxes.stage
  await page.locator(PLAYER).evaluate(async (player) => {
    const spacer = document.createElement('div')
    spacer.id = 'layout-spacer'
    spacer.style.blockSize = '200px'
    player.before(spacer)
    document.body.style.minHeight = '1600px'
    player.setAttribute('fit', 'width')
    player.removeAttribute('fit')
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  boxes = await geometry(h)
  check(
    'contain sizes from the viewport, not from the player position',
    Math.abs(boxes.stage.width - atTop.width) < 1 && Math.abs(boxes.stage.height - atTop.height) < 1,
    JSON.stringify({ atTop, spaced: boxes.stage }),
  )

  await page.locator(PLAYER).evaluate((player: HTMLElement & { controller: { play(): Promise<void> } }) => player.controller.play())
  await h.waitFor(PLAYER, (data) => data.playing === 'true')
  const beforeScroll = boxes.stage
  await page.evaluate(() => window.scrollBy(0, 150))
  await page.waitForTimeout(500)
  boxes = await geometry(h)
  check(
    'contain stage size stays fixed while playback and scrolling continue',
    Math.abs(boxes.stage.width - beforeScroll.width) < 1 && Math.abs(boxes.stage.height - beforeScroll.height) < 1,
    JSON.stringify({ before: beforeScroll, after: boxes.stage }),
  )
  await page.evaluate(() => {
    document.getElementById('layout-spacer')?.remove()
    document.body.style.removeProperty('min-height')
    window.scrollTo(0, 0)
  })
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { pause(): void; go(index: number): Promise<void> } }) => {
    player.controller.pause()
    await player.controller.go(0)
  })

  await page.locator(PLAYER).evaluate((player: HTMLElement) => {
    player.style.setProperty('--segnavia-fit-reserve', '120px')
    window.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(100)
  boxes = await geometry(h)
  check('contain honors 120px of reserved viewport height', boxes.player.height <= 600, JSON.stringify(boxes))
  await page.locator(PLAYER).evaluate((player: HTMLElement) => player.style.removeProperty('--segnavia-fit-reserve'))

  await page.setViewportSize({ width: 1280, height: 1400 })
  await page.waitForTimeout(100)
  boxes = await geometry(h)
  check('contain fills the available width in a tall viewport', Math.abs(boxes.stage.width - 1280) < 1, JSON.stringify(boxes))

  await page.setViewportSize({ width: 360, height: 720 })
  await page.waitForTimeout(100)
  boxes = await geometry(h)
  check('contain fills the available width at 360px', Math.abs(boxes.stage.width - 360) < 1, JSON.stringify(boxes))
  await h.evidence('player-contain-360x720.png')

  await page.setViewportSize({ width: 360, height: 640 })
  await page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { load(deck: unknown): Promise<void> } }) => {
    player.setAttribute('rail', '')
    await player.controller.load({
      title: 'Portrait rail layout',
      size: { width: 480, height: 640 },
      slides: [{ id: 'portrait', content: { kind: 'html', html: '<p>Portrait</p>' } }],
    })
  })
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check('narrow contain reserves room for a stacked rail row', boxes.player.height <= 640, JSON.stringify(boxes))

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-width.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  boxes = await geometry(h)
  check('width fit preserves the below-fold control bar', boxes.bar.bottom > 720, JSON.stringify(boxes))

  await page.goto(h.url('layout-overlay.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check('overlay makes the player and slide the same height', Math.abs(boxes.player.height - boxes.stage.height) < 1, JSON.stringify(boxes))
  check('overlay controls are visible while paused', boxes.bar.opacity === '1', JSON.stringify(boxes))
  await h.evidence('player-overlay-1280x720.png')
  await page.locator(PLAYER).evaluate((player: HTMLElement & { controller: { play(): Promise<void> } }) => player.controller.play())
  await h.waitFor(PLAYER, (data) => data.playing === 'true')
  await page.waitForTimeout(3200)
  boxes = await waitForBarOpacity(h, '0')
  check('overlay controls hide three seconds into playback', boxes.bar.opacity === '0', JSON.stringify(boxes))
  await page.mouse.move(400, 300)
  boxes = await waitForBarOpacity(h, '1')
  check('pointer movement reveals overlay controls', boxes.bar.opacity === '1', JSON.stringify(boxes))
  await page.waitForTimeout(3200)
  await page.keyboard.press('Tab')
  boxes = await waitForBarOpacity(h, '1')
  check('Tab focus reveals overlay controls', boxes.bar.opacity === '1', JSON.stringify(boxes))

  await page.locator(PLAYER).evaluate((player) => player.setAttribute('rail', ''))
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check(
    'wide overlay rail sits at inline start beside the slide',
    boxes.rail.right <= boxes.stage.left && Math.abs(boxes.player.height - boxes.stage.height) < 1,
    JSON.stringify(boxes),
  )
  check(
    'wide overlay bar stays within the slide instead of the rail',
    boxes.bar.left >= boxes.stage.left && boxes.bar.right <= boxes.stage.right && boxes.bar.bottom <= boxes.stage.bottom,
    JSON.stringify(boxes),
  )

  await page.setViewportSize({ width: 360, height: 720 })
  await page.goto(h.url('layout-overlay.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check('overlay keeps the player and slide the same height at 360px', Math.abs(boxes.player.height - boxes.stage.height) < 1, JSON.stringify(boxes))
  await h.evidence('player-overlay-360x720.png')

  await page.locator(PLAYER).evaluate((player) => player.setAttribute('rail', ''))
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check(
    'narrow overlay rail stacks below the slide',
    boxes.rail.top >= boxes.stage.bottom && Math.abs(boxes.player.height - boxes.stage.height - boxes.rail.height) < 1,
    JSON.stringify(boxes),
  )
  await verifyRemoval(h)
  await verifyCompactPlayerActions(h)
}

async function verifyRemoval(h: Harness) {
  const { page, check } = h
  const result = await page
    .locator(PLAYER)
    .evaluate(async (player: HTMLElement & { controller: EventTarget & { play(): Promise<void>; state: { playing: boolean; slideElapsedMs: number } } }) => {
      const controller = player.controller
      await controller.play()
      let pausedChanges = 0
      controller.addEventListener('change', (event) => {
        if (!(event as CustomEvent<{ playing: boolean }>).detail.playing) pausedChanges++
      })
      await new Promise((resolve) => setTimeout(resolve, 200))
      player.remove()
      const removedAt = controller.state.slideElapsedMs
      await new Promise((resolve) => setTimeout(resolve, 300))
      const stoppedAt = controller.state.slideElapsedMs
      document.body.append(player)
      const reinsertedPaused = !controller.state.playing
      await controller.play()
      await new Promise((resolve) => setTimeout(resolve, 200))
      return { removedAt, stoppedAt, reinsertedPaused, resumedAt: controller.state.slideElapsedMs, pausedChanges }
    })
  check(
    'removing a playing player stops time and reinserting leaves it paused and reusable',
    Math.abs(result.stoppedAt - result.removedAt) < 1 && result.reinsertedPaused && result.resumedAt > result.stoppedAt && result.pausedChanges === 1,
    JSON.stringify(result),
  )
}

interface Box {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

interface ActionBarGeometry {
  playerWidth: number
  overlaps: string[]
  offscreen: string[]
  playCentered: boolean
  actionsUnderTransport: boolean
}

async function mountRailAndActions(h: Harness) {
  await h.page.locator(PLAYER).evaluate(async (player: HTMLElement & { controller: { load(deck: unknown): Promise<void> } }) => {
    player.setAttribute('rail', '')
    for (const button of [...player.querySelectorAll('[slot="actions"]')]) button.remove()
    for (const label of ['Settings', 'Export', 'Share']) {
      const action = document.createElement('button')
      action.slot = 'actions'
      action.setAttribute('aria-label', label)
      player.append(action)
    }
    await player.controller.load({
      title: 'Compact actions',
      size: { width: 1280, height: 720 },
      slides: [
        { id: 'a', content: { kind: 'html', html: '<p>A</p>' }, notes: 'Notes' },
        { id: 'b', content: { kind: 'html', html: '<p>B</p>' } },
        { id: 'c', content: { kind: 'html', html: '<p>C</p>' } },
      ],
    })
  })
  await h.waitFor(PLAYER, (data) => data.slide === '1')
}

async function actionBarGeometry(h: Harness): Promise<ActionBarGeometry> {
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const boxOf = (element: Element | null | undefined): Box | null => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    const control = (selector: string) => boxOf(root.querySelector(selector)?.shadowRoot?.querySelector('button'))
    const play = control('segnavia-play')
    const named = [
      { name: 'previous', box: control('segnavia-step[to="previous"]') },
      { name: 'play', box: play },
      { name: 'next', box: control('segnavia-step[to="next"]') },
      { name: 'present', box: control('segnavia-fullscreen') },
      ...[...player.querySelectorAll('[slot="actions"]')].map((action, index) => ({ name: `action-${index + 1}`, box: boxOf(action) })),
    ].filter((entry) => entry.box && entry.box.width > 0 && entry.box.height > 0) as { name: string; box: Box }[]
    const overlaps: string[] = []
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        const a = named[i]?.box
        const b = named[j]?.box
        if (a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push(`${named[i]?.name}∩${named[j]?.name}`)
      }
    }
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const offscreen = named
      .filter(({ box }) => box.left < -0.5 || box.top < -0.5 || box.right > viewport.width + 0.5 || box.bottom > viewport.height + 0.5)
      .map(({ name }) => name)
    const playerBox = boxOf(player)
    const actions = named.filter(({ name }) => name.startsWith('action-'))
    return {
      playerWidth: playerBox?.width ?? 0,
      overlaps,
      offscreen,
      playCentered: play && playerBox ? Math.abs(play.left + play.width / 2 - (playerBox.left + playerBox.width / 2)) < 1 : false,
      actionsUnderTransport: Boolean(play && actions.length === 3 && actions.every(({ box }) => box.top >= play.bottom - 0.5)),
    }
  })
}

async function verifyCompactPlayerActions(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h)
  await page.waitForTimeout(200)
  let bars = await actionBarGeometry(h)
  check('393px player with a rail is 393px wide', Math.abs(bars.playerWidth - 393) < 1, JSON.stringify(bars))
  check(
    '393px bar with three actions keeps Play, Step, Next, Present and actions from overlapping',
    bars.overlaps.length === 0,
    JSON.stringify(bars.overlaps),
  )
  check('393px bar with three actions keeps every control inside the viewport', bars.offscreen.length === 0, JSON.stringify(bars.offscreen))
  check('393px bar with three actions places the actions under the transport', bars.actionsUnderTransport, JSON.stringify(bars))
  await h.evidence('player-actions-393.png')

  await page.goto(h.url('layout-overlay.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h)
  await page.waitForTimeout(200)
  bars = await actionBarGeometry(h)
  check(
    '393px overlay bar with three actions keeps Play, Step, Next, Present and actions from overlapping',
    bars.overlaps.length === 0,
    JSON.stringify(bars.overlaps),
  )
  check('393px overlay bar with three actions keeps every control inside the viewport', bars.offscreen.length === 0, JSON.stringify(bars.offscreen))
  await h.evidence('player-actions-overlay-393.png')

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountRailAndActions(h)
  await page.waitForTimeout(200)
  bars = await actionBarGeometry(h)
  check('1280px bar keeps play centered with three slotted actions', bars.playCentered, JSON.stringify(bars))
  check('1280px bar keeps three slotted actions on the transport row', !bars.actionsUnderTransport, JSON.stringify(bars))
}
