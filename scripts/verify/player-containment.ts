import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { compactBarHeight, measuredBarHeight } from '../../packages/frame/src/player-layout.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const PLAYER = 'segnavia-player'
const SLIDE_COUNT = 30
const BELOW_HEIGHT = 120
const MEASURED_BAR_HEIGHT_SRC = `${compactBarHeight.toString()}; return (${measuredBarHeight.toString()})`
const DESK_RAIL_AT_COMPACT = '@container (max-width:560px){:host([rail]) segnavia-rail{contain:size;block-size:0;min-block-size:100%;overflow:hidden}}'
const DESK_RAIL_WITHOUT_MIN_BLOCK = ':host([rail]) segnavia-rail{min-block-size:0}'

interface ContainmentFacts {
  playerBottom: number
  playerHeight: number
  viewport: number
  reserve: number
  stageBottom: number
  stageHeight: number
  captionHeight: number
  barHeight: number
  barTop: number
  belowTop: number
  belowHeight: number
  railHeight: number
  railContentHeight: number
  bodyGridAreaHeight: number
  listClientHeight: number
  listScrollHeight: number
  screenPadding: number
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
  return h.page.locator(PLAYER).evaluate((player, src) => {
    const measuredBarHeight = new Function(src)() as (root: ShadowRoot) => number
    const root = player.shadowRoot as ShadowRoot
    const rail = root.querySelector('segnavia-rail') as HTMLElement
    const below = root.querySelector('.below') as HTMLElement
    const stage = root.querySelector('segnavia-stage') as HTMLElement
    const caption = root.querySelector('segnavia-caption') as HTMLElement
    const bar = root.querySelector('.bar') as HTMLElement
    const body = root.querySelector('.body') as HTMLElement
    const screen = root.querySelector('.screen') as HTMLElement
    const list = rail.shadowRoot?.querySelector('ol') as HTMLElement | null
    const playerBox = player.getBoundingClientRect()
    const bodyBox = body.getBoundingClientRect()
    const captionBox = caption.getBoundingClientRect()
    const screenStyle = getComputedStyle(screen)
    return {
      playerBottom: playerBox.bottom,
      playerHeight: playerBox.height,
      viewport: window.innerHeight,
      reserve: (root.querySelector('.fit-reserve') as HTMLElement).offsetHeight,
      stageBottom: stage.getBoundingClientRect().bottom,
      stageHeight: stage.getBoundingClientRect().height,
      captionHeight: captionBox.height,
      barHeight: measuredBarHeight(root),
      barTop: bar.getBoundingClientRect().top,
      belowTop: below.getBoundingClientRect().top,
      belowHeight: below.getBoundingClientRect().height,
      railHeight: rail.clientHeight,
      railContentHeight: list?.scrollHeight ?? 0,
      bodyGridAreaHeight: (captionBox.height > 0 ? captionBox.bottom : bodyBox.bottom) - bodyBox.top,
      listClientHeight: list?.clientHeight ?? 0,
      listScrollHeight: list?.scrollHeight ?? 0,
      screenPadding: (Number.parseFloat(screenStyle.paddingBlockStart) || 0) + (Number.parseFloat(screenStyle.paddingBlockEnd) || 0),
      frames: rail.shadowRoot?.querySelectorAll('iframe').length ?? 0,
    }
  }, MEASURED_BAR_HEIGHT_SRC)
}

async function waitForThumbnails(h: Harness): Promise<ContainmentFacts> {
  const deadline = Date.now() + BOUNDED_WAIT_MS
  await h.page.waitForFunction(
    () => {
      const rail = document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-rail')
      return (rail?.shadowRoot?.querySelectorAll('iframe').length ?? 0) >= 1
    },
    undefined,
    { timeout: BOUNDED_WAIT_MS },
  )
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
  const scratch = process.env.BOTTEGA_SCRATCH
  if (!scratch) return
  mkdirSync(scratch, { recursive: true })
  await h.page.screenshot({ path: path.join(scratch, name) })
}

async function withPlayerStyle<T>(h: Harness, css: string, run: () => Promise<T>): Promise<T> {
  await h.page.locator(PLAYER).evaluate((player, text) => {
    const root = player.shadowRoot
    if (!root) return
    root.querySelector('[data-containment-probe]')?.remove()
    const style = document.createElement('style')
    style.dataset.containmentProbe = ''
    style.textContent = text
    root.append(style)
  }, css)
  try {
    await h.page.waitForTimeout(200)
    return await run()
  } finally {
    await h.page.locator(PLAYER).evaluate((player) => {
      player.shadowRoot?.querySelector('[data-containment-probe]')?.remove()
    })
  }
}

function viewportFits(boxes: ContainmentFacts) {
  return boxes.playerBottom <= boxes.viewport - boxes.reserve + 1
}

function chromeUncovered(boxes: ContainmentFacts) {
  return boxes.stageBottom <= boxes.barTop + 1 && boxes.stageBottom <= boxes.belowTop + 1
}

function railUsedEqualsContent(boxes: ContainmentFacts) {
  return Math.abs(boxes.railHeight - boxes.railContentHeight) <= 2
}

function compactStackEqualsPlayer(boxes: ContainmentFacts) {
  return (
    Math.abs(
      boxes.playerHeight - (boxes.stageHeight + boxes.captionHeight + boxes.barHeight + boxes.railContentHeight + boxes.belowHeight + boxes.screenPadding),
    ) <= 2
  )
}

function railEqualsBodyGridArea(boxes: ContainmentFacts) {
  return Math.abs(boxes.railHeight - boxes.bodyGridAreaHeight) <= 2
}

function listIsScrollport(boxes: ContainmentFacts) {
  return boxes.listScrollHeight > boxes.listClientHeight
}

function thumbnailRange(boxes: ContainmentFacts) {
  return boxes.frames > 1 && boxes.frames < SLIDE_COUNT
}

function checkDesk(h: Harness, boxes: ContainmentFacts) {
  h.check('desk contain with rail and below stays in the viewport', viewportFits(boxes), JSON.stringify(boxes))
  h.check('desk contain keeps the bar and below content uncovered by the stage', chromeUncovered(boxes), JSON.stringify(boxes))
  h.check('desk rail client height equals the body grid area', railEqualsBodyGridArea(boxes), JSON.stringify(boxes))
  h.check('desk rail list is a scrollport', listIsScrollport(boxes), JSON.stringify(boxes))
  h.check('desk rail mounts more than one and fewer than 30 thumbnail frames', thumbnailRange(boxes), JSON.stringify(boxes))
}

function checkResponsive(h: Harness, boxes: ContainmentFacts) {
  h.check('responsive contain with rail and below stays in the viewport', viewportFits(boxes), JSON.stringify(boxes))
  h.check('responsive contain keeps the bar and below content uncovered by the stage', chromeUncovered(boxes), JSON.stringify(boxes))
  h.check('responsive rail mounts more than one and fewer than 30 thumbnail frames', thumbnailRange(boxes), JSON.stringify(boxes))
}

function checkCompact(h: Harness, boxes: ContainmentFacts) {
  h.check('compact rail used height equals its content', railUsedEqualsContent(boxes), JSON.stringify(boxes))
  h.check('compact stage, caption, flattened bar, rail and below add up to the player height', compactStackEqualsPlayer(boxes), JSON.stringify(boxes))
}

export async function probeContainment(h: Harness) {
  const { page } = h
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountThirty(h, 'fixed')
  await waitForThumbnails(h)
  const collapsed = await withPlayerStyle(h, DESK_RAIL_WITHOUT_MIN_BLOCK, () => facts(h))
  h.check('desk rail client height equals the body grid area', railEqualsBodyGridArea(collapsed), JSON.stringify(collapsed))
  await page.waitForTimeout(200)
  const desk = await facts(h)
  h.check('desk rail client height equals the body grid area', railEqualsBodyGridArea(desk), JSON.stringify(desk))

  await page.setViewportSize({ width: 393, height: 852 })
  await mountThirty(h, 'fixed')
  await page.waitForTimeout(200)
  const stretched = await withPlayerStyle(h, DESK_RAIL_AT_COMPACT, () => facts(h))
  checkCompact(h, stretched)
  await page.waitForTimeout(200)
  const compact = await facts(h)
  checkCompact(h, compact)
}

export async function verifyContainment(h: Harness) {
  const { page } = h
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(h.url('layout-contain.html'))
  await h.waitFor(PLAYER, (data) => data.slide === '1')
  await mountThirty(h, 'fixed')
  let boxes = await waitForThumbnails(h)
  checkDesk(h, boxes)
  await scratchShot(h, 'contain-30-1280x720.png')
  await h.evidence('contain-30-1280x720.png')

  await mountThirty(h, 'responsive')
  boxes = await waitForThumbnails(h)
  checkResponsive(h, boxes)

  await page.setViewportSize({ width: 393, height: 852 })
  await mountThirty(h, 'fixed')
  await page.waitForTimeout(200)
  boxes = await facts(h)
  checkCompact(h, boxes)
  await scratchShot(h, 'contain-30-393x852.png')
  await h.evidence('contain-30-393x852.png')
}
