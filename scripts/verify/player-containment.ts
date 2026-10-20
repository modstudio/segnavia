import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = 'segnavia-player'
const SLIDE_COUNT = 30
const BELOW_HEIGHT = 120

interface ContainmentFacts {
  playerBottom: number
  playerHeight: number
  viewport: number
  reserve: number
  stageBottom: number
  barTop: number
  belowTop: number
  contentBottom: number
  frames: number
}

const thirtySlides = () =>
  Array.from({ length: SLIDE_COUNT }, (_, index) => ({
    id: `s${index + 1}`,
    content: { kind: 'html', html: `<p>Slide ${index + 1}</p>` },
  }))

async function mountThirty(h: Harness, layout: 'fixed' | 'responsive') {
  await h.page.locator(PLAYER).evaluate(
    async (player, input) => {
      const host = player as HTMLElement & { controller: { load(deck: unknown): Promise<void> } }
      host.setAttribute('rail', '')
      host.querySelector('[slot="below"]')?.remove()
      const below = document.createElement('div')
      below.slot = 'below'
      below.style.blockSize = `${input.belowHeight}px`
      below.style.background = '#ccc'
      host.append(below)
      await host.controller.load({
        title: 'Thirty',
        layout: input.layout,
        size: { width: 1280, height: 720 },
        slides: input.slides,
      })
    },
    { layout, belowHeight: BELOW_HEIGHT, slides: thirtySlides() },
  )
  await h.waitFor(PLAYER, (data) => data.slide === '1')
}

async function facts(h: Harness): Promise<ContainmentFacts> {
  return h.page.locator(PLAYER).evaluate((player) => {
    const root = player.shadowRoot as ShadowRoot
    const rail = root.querySelector('segnavia-rail') as HTMLElement
    const below = root.querySelector('.below') as HTMLElement
    const stage = root.querySelector('segnavia-stage') as HTMLElement
    const bar = root.querySelector('.bar') as HTMLElement
    const playerBox = player.getBoundingClientRect()
    return {
      playerBottom: playerBox.bottom,
      playerHeight: playerBox.height,
      viewport: window.innerHeight,
      reserve: (root.querySelector('.fit-reserve') as HTMLElement).offsetHeight,
      stageBottom: stage.getBoundingClientRect().bottom,
      barTop: bar.getBoundingClientRect().top,
      belowTop: below.getBoundingClientRect().top,
      contentBottom: below.getBoundingClientRect().bottom,
      frames: rail.shadowRoot?.querySelectorAll('iframe').length ?? 0,
    }
  })
}

async function waitForThumbnails(h: Harness): Promise<ContainmentFacts> {
  const deadline = Date.now() + BOUNDED_WAIT_MS
  await h.page
    .waitForFunction(
      () => {
        const rail = document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')
        return (rail?.shadowRoot?.querySelectorAll('iframe').length ?? 0) >= 1
      },
      undefined,
      { timeout: BOUNDED_WAIT_MS },
    )
    .catch(() => {})
  let last = -1
  let stableAt = Date.now()
  let current = await facts(h)
  while (Date.now() < deadline) {
    if (current.frames !== last) {
      last = current.frames
      stableAt = Date.now()
    } else if (current.frames > 0 && Date.now() - stableAt >= 400) break
    await h.page.waitForTimeout(100)
    current = await facts(h)
  }
  return current
}

async function scratchShot(h: Harness, name: string) {
  const scratch = process.env.ORCH_SCRATCH
  if (!scratch) return
  mkdirSync(scratch, { recursive: true })
  await h.page.screenshot({ path: path.join(scratch, name) })
}

export async function verifyContainment(h: Harness) {
  const { page, check } = h
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountThirty(h, 'fixed')
  let boxes = await waitForThumbnails(h)
  const deskFits = boxes.playerBottom <= boxes.viewport - boxes.reserve + 1
  check(
    'desk contain with rail and below stays in the viewport and mounts fewer than 30 thumbnails',
    deskFits && boxes.frames > 0 && boxes.frames < SLIDE_COUNT,
    JSON.stringify(boxes),
  )
  await scratchShot(h, 'contain-30-1280x720.png')
  await h.evidence('contain-30-1280x720.png')

  await mountThirty(h, 'responsive')
  boxes = await waitForThumbnails(h)
  const responsiveFits = boxes.playerBottom <= boxes.viewport - boxes.reserve + 1
  const uncovered = boxes.stageBottom <= boxes.barTop + 1 && boxes.stageBottom <= boxes.belowTop + 1
  check(
    'responsive contain with rail and below stays in the viewport, uncovers bar and below, and mounts fewer than 30 thumbnails',
    responsiveFits && uncovered && boxes.frames > 0 && boxes.frames < SLIDE_COUNT,
    JSON.stringify(boxes),
  )

  await page.setViewportSize({ width: 393, height: 852 })
  await mountThirty(h, 'fixed')
  await page.waitForTimeout(200)
  boxes = await facts(h)
  check('compact contain keeps the player height equal to its content', Math.abs(boxes.playerBottom - boxes.contentBottom) <= 2, JSON.stringify(boxes))
  await scratchShot(h, 'contain-30-393x852.png')
  await h.evidence('contain-30-393x852.png')
}
