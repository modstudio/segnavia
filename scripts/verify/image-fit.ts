import type { Harness } from './harness.ts'

const modes = ['contain', 'cover', 'width', 'focus'] as const
const near = (a: number, b: number) => Math.abs(a - b) <= 1

interface FitBoxes {
  canvas: { left: number; top: number; right: number; bottom: number }
  image: { left: number; top: number; right: number; bottom: number; width: number; height: number }
  ring: { left: number; top: number; right: number; bottom: number; width: number; height: number }
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
    const imageCovers =
      boxes.image.left <= boxes.canvas.left + epsilon &&
      boxes.image.top <= boxes.canvas.top + epsilon &&
      boxes.image.right >= boxes.canvas.right - epsilon &&
      boxes.image.bottom >= boxes.canvas.bottom - epsilon
    h.check('focus keeps the annotation ring inside a filled canvas', ringInside && imageCovers)
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
    `${mode} maps the ring through the image transform in ${selector === '#styled' ? 'the styled' : 'the unstyled'} stage`,
    near(boxes.ring.left, expected.left) &&
      near(boxes.ring.top, expected.top) &&
      near(boxes.ring.width, expected.width) &&
      near(boxes.ring.height, expected.height),
  )
  checkMode(h, mode, boxes)
}

export async function verifyImageFit(h: Harness): Promise<void> {
  await h.page.goto(h.url('fit.html'))
  await h.waitFor('#styled', (data) => data.slide === '1')
  await h.page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('segnavia-stage img')].length === 2 &&
      [...document.querySelectorAll<HTMLImageElement>('segnavia-stage img')].every((image) => image.complete && image.naturalWidth > 0),
  )
  for (const [index, mode] of modes.entries()) {
    await h.page.evaluate(
      (next) =>
        Promise.all(
          [...document.querySelectorAll('segnavia-stage')].map((stage) =>
            (stage as HTMLElement & { controller: { go(index: number): Promise<void> } }).controller.go(next),
          ),
        ),
      index,
    )
    await h.waitFor('#styled', (data, slide) => data.slide === slide, { arg: String(index + 1) })
    await h.waitFor('#unstyled', (data, slide) => data.slide === slide, { arg: String(index + 1) })
    for (const selector of ['#styled', '#unstyled']) await checkStage(h, selector, mode)
    await h.evidence(`fit-${mode}.png`)
  }
}
