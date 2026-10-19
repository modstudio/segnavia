import { fitImage } from '@segnavia/frame/image-fit'
import { compactBarHeight } from '../../packages/frame/src/player-layout.ts'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const COMPACT_BAR_HEIGHT_SRC = compactBarHeight.toString()

const canvasFacts = (element: HTMLElement) => {
  const canvas = element.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
  const frame = canvas?.querySelector('iframe')
  const layer = canvas?.querySelector<HTMLElement>('.segnavia-stage__media')
  return {
    width: canvas?.clientWidth ?? 0,
    height: canvas?.clientHeight ?? 0,
    transform: canvas?.style.transform ?? '',
    layerTransform: layer?.style.transform ?? '',
    hasFrame: Boolean(frame),
  }
}

async function frameFacts(h: Harness) {
  return h.page
    .locator('.segnavia-stage__canvas[data-active] iframe')
    .contentFrame()
    .locator('body')
    .evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      background: getComputedStyle(document.body).backgroundColor,
      text: document.querySelector('output')?.textContent,
    }))
}

const playerHeightFacts = (player: HTMLElement & { shadowRoot: ShadowRoot }, compactBarHeightSrc: string) => {
  const compactBarHeight = new Function(`return (${compactBarHeightSrc})`)() as typeof import('../../packages/frame/src/player-layout.ts').compactBarHeight
  const root = player.shadowRoot
  const stage = root.querySelector('segnavia-stage') as HTMLElement
  const height = (selector: string) => root.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0
  const controls =
    (root.querySelector<HTMLElement>('segnavia-caption')?.offsetHeight ?? 0) +
    (height('.bar') ||
      compactBarHeight({
        track: height('segnavia-track'),
        start: height('.start'),
        center: height('.center'),
        endControls: height('.end-controls'),
        actions: height('.actions'),
      }))
  return { player: player.clientHeight, stage: stage.clientHeight, controls }
}

function compactChromeFits(compactBarHeightSrc: string) {
  const compactBarHeight = new Function(`return (${compactBarHeightSrc})`)() as typeof import('../../packages/frame/src/player-layout.ts').compactBarHeight
  const player = document.querySelector<HTMLElement>('segnavia-player')
  const root = player?.shadowRoot
  const stage = root?.querySelector<HTMLElement>('segnavia-stage')
  const height = (selector: string) => root?.querySelector<HTMLElement>(selector)?.offsetHeight ?? 0
  const controls =
    (root?.querySelector<HTMLElement>('segnavia-caption')?.offsetHeight ?? 0) +
    (height('.bar') ||
      compactBarHeight({
        track: height('segnavia-track'),
        start: height('.start'),
        center: height('.center'),
        endControls: height('.end-controls'),
        actions: height('.actions'),
      }))
  return Boolean(player && stage && Math.abs(stage.clientHeight - (player.clientHeight - controls)) <= 1)
}

export async function verifyResponsive(h: Harness) {
  await h.page.goto(h.url('responsive-stage.html'))
  await h.page.locator('.segnavia-stage__canvas[data-active] iframe').waitFor()
  let frameSettled = true
  await h.page
    .locator('.segnavia-stage__canvas[data-active] iframe')
    .contentFrame()
    .getByText('720x520', { exact: true })
    .waitFor({ timeout: BOUNDED_WAIT_MS })
    .catch(() => {
      frameSettled = false
    })
  let canvas = await h.page.locator('segnavia-stage').evaluate(canvasFacts)
  let frame = await frameFacts(h)
  h.check(
    'a 720 by 520 responsive stage lays its HTML frame at the unscaled canvas size',
    frameSettled &&
      canvas.width === 720 &&
      canvas.height === 520 &&
      canvas.transform === 'scale(1)' &&
      frame.width === canvas.width &&
      frame.height === canvas.height &&
      frame.text === '720x520',
    JSON.stringify({ canvas, frame }),
  )

  await h.page.locator('#host').evaluate((host: HTMLElement) => {
    host.style.inlineSize = '360px'
    host.style.blockSize = '640px'
  })
  await h.page.waitForFunction(() => document.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')?.clientWidth === 360)
  canvas = await h.page.locator('segnavia-stage').evaluate(canvasFacts)
  frame = await frameFacts(h)
  h.check(
    'resizing a responsive stage reflows its frame and applies narrow CSS',
    canvas.width === 360 && canvas.height === 640 && frame.width === 360 && frame.text === '360x640' && frame.background === 'rgb(220, 80, 60)',
    JSON.stringify({ canvas, frame }),
  )

  await h.page.locator('segnavia-stage').evaluate((stage: HTMLElement & { controller?: { go(index: number): Promise<void> } }) => stage.controller?.go(1))
  await h.page.waitForFunction(() => Boolean(document.querySelector('.segnavia-stage__canvas[data-active] .segnavia-stage__media')))
  canvas = await h.page.locator('segnavia-stage').evaluate(canvasFacts)
  const placement = fitImage({ width: 360, height: 640 }, { width: 1280, height: 400 }, 'contain')
  const expectedTransform = `translate(${placement.x}px, ${placement.y}px) scale(${placement.scale})`
  h.check(
    'responsive image placement fits against the box size',
    canvas.layerTransform === expectedTransform,
    `${canvas.layerTransform}; expected ${expectedTransform}`,
  )

  await h.page.goto(h.url('responsive-fixed.html'))
  await h.page.locator('.segnavia-stage__canvas[data-active]').waitFor()
  const fixed = await h.page.locator('segnavia-stage').evaluate(canvasFacts)
  h.check(
    'a fixed deck in the same box keeps its scaled 1280 by 720 canvas',
    fixed.width === 1280 && fixed.height === 720 && fixed.transform === 'scale(0.5625)',
    JSON.stringify(fixed),
  )

  await h.page.goto(h.url('responsive-thumbnail.html'))
  await h.page
    .waitForFunction(() => Boolean(document.querySelector('segnavia-thumbnail')?.shadowRoot?.querySelector('.segnavia-stage__canvas')), undefined, {
      timeout: BOUNDED_WAIT_MS,
    })
    .catch(() => {})
  const thumbnail = await h.page.locator('segnavia-thumbnail').evaluate((element) => {
    const canvas = element.shadowRoot?.querySelector<HTMLElement>('.segnavia-stage__canvas')
    return { width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0, transform: canvas?.style.transform ?? '' }
  })
  h.check(
    'a standalone thumbnail of a responsive deck keeps the scaled 1280 by 720 canvas',
    thumbnail.width === 1280 && thumbnail.height === 720 && thumbnail.transform === 'scale(0.25)',
    JSON.stringify(thumbnail),
  )

  await h.page.setViewportSize({ width: 720, height: 600 })
  await h.page.goto(h.url('responsive-player-contain.html'))
  await h.page.locator('.segnavia-stage__canvas[data-active]').waitFor()
  await h.page.waitForFunction(() => document.querySelector('segnavia-player')?.shadowRoot?.querySelector('segnavia-stage')?.clientHeight === 560)
  const contain = await h.page.locator('segnavia-player').evaluate((player: HTMLElement & { shadowRoot: ShadowRoot }) => {
    const stage = player.shadowRoot.querySelector('segnavia-stage') as HTMLElement
    return { width: stage.clientWidth, height: stage.clientHeight }
  })
  h.check('responsive contain fills viewport height minus reserve at full width', contain.width === 720 && contain.height === 560, JSON.stringify(contain))

  await h.page.setViewportSize({ width: 720, height: 520 })
  await h.page.goto(h.url('responsive-player-height.html'))
  await h.page.locator('segnavia-player').evaluate((player: HTMLElement & { controller?: { go(index: number): Promise<void> } }) => player.controller?.go(0))
  await h.page.locator('iframe').waitFor()
  await h.page.waitForFunction(compactChromeFits, COMPACT_BAR_HEIGHT_SRC)
  const wideHeight = await h.page.locator('segnavia-player').evaluate(playerHeightFacts, COMPACT_BAR_HEIGHT_SRC)
  h.check(
    'a 720 by 520 responsive height-fit player fills the height above its controls',
    Math.abs(wideHeight.stage - (wideHeight.player - wideHeight.controls)) <= 1,
    JSON.stringify(wideHeight),
  )
  await h.evidence('responsive-player-720x520.png')
  const playerFrame = await frameFacts(h)
  const playerCanvas = await h.page.locator('segnavia-player').evaluate((player: HTMLElement & { shadowRoot: ShadowRoot }) => {
    const canvas = player.shadowRoot.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    return { width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0, transform: canvas?.style.transform ?? '' }
  })
  h.check(
    'a responsive height-fit player uses a full-width unscaled canvas and matching frame',
    playerCanvas.width === 720 &&
      playerCanvas.transform === 'scale(1)' &&
      playerFrame.width === playerCanvas.width &&
      playerFrame.height === playerCanvas.height,
    JSON.stringify({ playerCanvas, playerFrame }),
  )
  await h.page.setViewportSize({ width: 360, height: 640 })
  await h.page.locator('#host').evaluate((host: HTMLElement) => {
    host.style.inlineSize = '360px'
    host.style.blockSize = '640px'
  })
  await h.page.waitForFunction(() => document.querySelector('segnavia-player')?.shadowRoot?.querySelector('.segnavia-stage__canvas')?.clientWidth === 360)
  await h.page.waitForFunction(compactChromeFits, COMPACT_BAR_HEIGHT_SRC)
  const narrowHeight = await h.page.locator('segnavia-player').evaluate(playerHeightFacts, COMPACT_BAR_HEIGHT_SRC)
  h.check(
    'a 360 by 640 responsive height-fit player fills the height above its controls',
    Math.abs(narrowHeight.stage - (narrowHeight.player - narrowHeight.controls)) <= 1,
    JSON.stringify(narrowHeight),
  )
  await h.evidence('responsive-player-360x640.png')
}
