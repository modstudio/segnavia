import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'
import { verifyCompactPlayerActions } from './player-compact.ts'
import { verifyContainment } from './player-containment.ts'

const PLAYER = 'segnavia-player'

interface Geometry {
  player: { width: number; height: number }
  screen: { top: number; right: number; bottom: number; left: number; width: number; height: number }
  stage: { top: number; right: number; bottom: number; left: number; width: number; height: number }
  rail: { top: number; right: number; bottom: number; left: number; width: number; height: number }
  bar: { top: number; right: number; bottom: number; left: number; opacity: string }
  gutter: { inlineStart: number; inlineEnd: number; blockStart: number; blockEnd: number; inline: number; block: number }
}

async function geometry(h: Harness): Promise<Geometry> {
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }
    }
    const bar = root.querySelector('.bar') as HTMLElement
    const screen = root.querySelector('.screen') as HTMLElement
    const screenStyle = getComputedStyle(screen)
    const barBox = box(bar)
    return {
      player: box(player),
      screen: box(screen),
      stage: box(root.querySelector('segnavia-stage') as HTMLElement),
      rail: box(root.querySelector('segnavia-rail') as HTMLElement),
      bar: { ...barBox, opacity: getComputedStyle(bar).opacity },
      gutter: {
        inlineStart: Number.parseFloat(screenStyle.paddingInlineStart),
        inlineEnd: Number.parseFloat(screenStyle.paddingInlineEnd),
        blockStart: Number.parseFloat(screenStyle.paddingBlockStart),
        blockEnd: Number.parseFloat(screenStyle.paddingBlockEnd),
        inline: Number.parseFloat(screenStyle.paddingInlineStart) + Number.parseFloat(screenStyle.paddingInlineEnd),
        block: Number.parseFloat(screenStyle.paddingBlockStart) + Number.parseFloat(screenStyle.paddingBlockEnd),
      },
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
  check(
    'contain fills the width available inside the gutter in a tall viewport',
    Math.abs(boxes.stage.width - (boxes.screen.width - boxes.gutter.inline)) < 1,
    JSON.stringify(boxes),
  )

  await page.setViewportSize({ width: 360, height: 720 })
  await page.waitForTimeout(100)
  boxes = await geometry(h)
  check(
    'contain fills the width available inside the gutter at 360px',
    Math.abs(boxes.stage.width - (boxes.screen.width - boxes.gutter.inline)) < 1,
    JSON.stringify(boxes),
  )
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
  check(
    'overlay makes the player and guttered slide area the same height',
    Math.abs(boxes.player.height - boxes.screen.height) < 1 && Math.abs(boxes.stage.height - (boxes.screen.height - boxes.gutter.block)) < 1,
    JSON.stringify(boxes),
  )
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
    boxes.rail.right <= boxes.screen.left &&
      Math.abs(boxes.stage.left - boxes.screen.left - boxes.gutter.inlineStart) < 1 &&
      Math.abs(boxes.player.height - boxes.screen.height) < 1 &&
      Math.abs(boxes.stage.height - (boxes.screen.height - boxes.gutter.block)) < 1,
    JSON.stringify(boxes),
  )
  check(
    'wide overlay bar stays within the slide instead of the rail',
    boxes.bar.left >= boxes.screen.left &&
      boxes.bar.right <= boxes.screen.right &&
      boxes.bar.bottom <= boxes.screen.bottom &&
      Math.abs(boxes.stage.left - boxes.bar.left - boxes.gutter.inlineStart) < 1 &&
      Math.abs(boxes.bar.right - boxes.stage.right - boxes.gutter.inlineEnd) < 1,
    JSON.stringify(boxes),
  )

  await page.setViewportSize({ width: 360, height: 720 })
  await page.goto(h.url('layout-overlay.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check(
    'overlay keeps the player and guttered slide area the same height at 360px',
    Math.abs(boxes.player.height - boxes.screen.height) < 1 && Math.abs(boxes.stage.height - (boxes.screen.height - boxes.gutter.block)) < 1,
    JSON.stringify(boxes),
  )
  await h.evidence('player-overlay-360x720.png')

  await page.locator(PLAYER).evaluate((player) => player.setAttribute('rail', ''))
  await page.waitForTimeout(200)
  boxes = await geometry(h)
  check(
    'narrow overlay rail stacks below the slide',
    boxes.rail.top >= boxes.screen.bottom && Math.abs(boxes.player.height - boxes.screen.height - boxes.rail.height) < 1,
    JSON.stringify(boxes),
  )
  await verifyRemoval(h)
  await verifyCompactPlayerActions(h)
  await verifyContainment(h)
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
