import type { Harness } from './harness.ts'

const modes = ['contain', 'cover', 'width', 'focus'] as const
const near = (a: number, b: number) => Math.abs(a - b) <= 1

interface FitBoxes {
  canvas: { left: number; top: number; right: number; bottom: number }
  image: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ring: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  label: { left: number; top: number; right: number; bottom: number }
}

function checkMode(h: Harness, mode: (typeof modes)[number], boxes: FitBoxes): void {
  const epsilon = 1
  if (mode === 'contain') {
    h.check(
      'contain keeps the whole image inside the canvas',
      boxes.image.left >= boxes.canvas.left - epsilon &&
        boxes.image.top >= boxes.canvas.top - epsilon &&
        boxes.image.right <= boxes.canvas.right + epsilon &&
        boxes.image.bottom <= boxes.canvas.bottom + epsilon,
    )
  } else if (mode === 'cover') {
    h.check(
      'cover fills the canvas',
      boxes.image.left <= boxes.canvas.left + epsilon &&
        boxes.image.top <= boxes.canvas.top + epsilon &&
        boxes.image.right >= boxes.canvas.right - epsilon &&
        boxes.image.bottom >= boxes.canvas.bottom - epsilon,
    )
  } else if (mode === 'width') {
    h.check(
      'width places the image top at the canvas top',
      near(boxes.image.left, boxes.canvas.left) && near(boxes.image.top, boxes.canvas.top) && near(boxes.image.width, boxes.canvas.right - boxes.canvas.left),
    )
  } else {
    const ringInside =
      boxes.ring.left >= boxes.canvas.left - epsilon &&
      boxes.ring.top >= boxes.canvas.top - epsilon &&
      boxes.ring.right <= boxes.canvas.right + epsilon &&
      boxes.ring.bottom <= boxes.canvas.bottom + epsilon
    h.check('focus keeps the annotation ring inside the canvas', ringInside)
  }
}

async function checkStage(h: Harness, selector: string, mode: (typeof modes)[number]): Promise<void> {
  const boxes = await h.page.locator(selector).evaluate((stage): FitBoxes => {
    const box = (element: Element) => {
      const value = element.getBoundingClientRect()
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }
    }
    return {
      canvas: box(stage.querySelector('.segnavia-stage__canvas') as Element),
      image: box(stage.querySelector('img') as Element),
      ring: box(stage.querySelector('[data-annotation] rect') as Element),
      label: box(stage.querySelector('[data-annotation] text') as Element),
    }
  })
  const scaleX = boxes.image.width / 1280
  const scaleY = boxes.image.height / 2400
  const expected = {
    left: boxes.image.left + 100 * scaleX,
    top: boxes.image.top + 2100 * scaleY,
    width: 200 * scaleX,
    height: 100 * scaleY,
  }
  h.check(
    `${mode} maps the ring through the image transform in ${selector === '#player segnavia-stage' ? 'the player' : 'the unstyled'} stage`,
    near(boxes.ring.left, expected.left) &&
      near(boxes.ring.top, expected.top) &&
      near(boxes.ring.width, expected.width) &&
      near(boxes.ring.height, expected.height),
  )
  checkMode(h, mode, boxes)
  if (mode === 'focus') {
    h.check(
      `focus keeps the arrow label inside the ${selector === '#player segnavia-stage' ? 'player' : 'unstyled'} canvas`,
      boxes.label.left >= boxes.canvas.left - 1 &&
        boxes.label.top >= boxes.canvas.top - 1 &&
        boxes.label.right <= boxes.canvas.right + 1 &&
        boxes.label.bottom <= boxes.canvas.bottom + 1,
    )
  }
}

export async function verifyImageFit(h: Harness): Promise<void> {
  await h.page.goto(h.url('fit.html'))
  await h.waitFor('#player', (data) => data.slide === '1')
  await h.page.waitForFunction(
    () =>
      document.querySelector('segnavia-player')?.shadowRoot?.querySelectorAll('segnavia-stage img').length === 1 &&
      [...(document.querySelector('segnavia-player')?.shadowRoot?.querySelectorAll<HTMLImageElement>('segnavia-stage img') ?? [])].every(
        (image) => image.complete && image.naturalWidth > 0,
      ) &&
      [...document.querySelectorAll<HTMLImageElement>('#unstyled img')].every((image) => image.complete && image.naturalWidth > 0),
  )
  for (const [index, mode] of modes.entries()) {
    await Promise.all([
      h.page
        .locator('#player')
        .evaluate((player, next) => (player as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(next), index),
      h.page
        .locator('#unstyled')
        .evaluate((stage, next) => (stage as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(next), index),
    ])
    await h.waitFor('#player', (data, slide) => data.slide === slide, { arg: String(index + 1) })
    await h.waitFor('#unstyled', (data, slide) => data.slide === slide, { arg: String(index + 1) })
    for (const selector of ['#player segnavia-stage', '#unstyled']) await checkStage(h, selector, mode)
    await h.evidence(`fit-${mode}.png`)
  }
  await Promise.all([
    h.page.locator('#player').evaluate((player) => (player as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(4)),
    h.page.locator('#unstyled').evaluate((stage) => (stage as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(4)),
  ])
  await h.waitFor('#player', (data) => data.slide === '5')
  await h.waitFor('#unstyled', (data) => data.slide === '5')
  const framed = await h.page.locator('#player segnavia-stage').evaluate((stage) => {
    const canvas = stage.querySelector('.segnavia-stage__canvas') as HTMLElement
    const image = stage.querySelector('img') as HTMLImageElement
    const canvasBox = canvas.getBoundingClientRect()
    const imageBox = image.getBoundingClientRect()
    const style = getComputedStyle(image)
    return {
      inset: imageBox.left - canvasBox.left,
      scale: canvasBox.width / 1280,
      radius: style.borderRadius,
      background: getComputedStyle(canvas).backgroundColor,
    }
  })
  h.check('the framed image is inset by 56 slide pixels on its framed axis', near(framed.inset, 56 * framed.scale), JSON.stringify(framed))
  h.check('the framed image has a nonzero computed border radius', Number.parseFloat(framed.radius) > 0, framed.radius)
  h.check('the player canvas background defaults to white', framed.background === 'rgb(255, 255, 255)', framed.background)
  await h.page.locator('#player').evaluate((player) => player.style.setProperty('--segnavia-shot-backdrop', 'rgb(0, 0, 0)'))
  const black = await h.page.locator('#player segnavia-stage .segnavia-stage__canvas').evaluate((canvas) => getComputedStyle(canvas).backgroundColor)
  h.check('the player canvas background follows --segnavia-shot-backdrop', black === 'rgb(0, 0, 0)', black)
  const transparent = await h.page.locator('#unstyled .segnavia-stage__canvas').evaluate((canvas) => getComputedStyle(canvas).backgroundColor)
  h.check('the unstyled headless stage canvas stays transparent', transparent === 'rgba(0, 0, 0, 0)', transparent)
  await h.evidence('framed-player.png')
}
