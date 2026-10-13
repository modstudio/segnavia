// Papers: placement geometry, scaling, direction, sandboxing, unstyled use
// and the browser print path for imposed pages.

import { inflateSync } from 'node:zlib'
import { Imposition, impose, PX_PER_MM } from '@segnavia/format'
import { labelPages, labelsImposition } from '../demo-page-fixtures.ts'
import type { Harness } from './harness.ts'

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

export async function verifyPapers(h: Harness) {
  const { page, check } = h
  const imposition = Imposition.parse(labelsImposition)
  const imposed = impose(imposition, 30)
  await page.goto(h.url('paper.html'))
  await page.waitForFunction(() => document.querySelectorAll('#first iframe').length === 30)

  const geometry = await page.locator('#first').evaluate((paper) => {
    const box = paper.querySelector('.segnavia-paper__paper') as HTMLElement
    const origin = box.getBoundingClientRect()
    const frames = [...paper.querySelectorAll('iframe')]
    const indexes = [0, 2, frames.length - 1]
    return {
      scale: origin.width / Number.parseFloat(box.style.width),
      origin: { x: origin.x, y: origin.y },
      frames: indexes.map((index) => {
        const frame = frames[index] as HTMLIFrameElement
        const rect = frame.getBoundingClientRect()
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }),
    }
  })
  const placements = [0, 2, 29].map((index) => imposed.placements[index]?.bleedBox)
  const matches = geometry.frames.every((frame, index) => {
    const placement = placements[index]
    if (!placement) return false
    const expected = {
      x: geometry.origin.x + placement.x * PX_PER_MM * geometry.scale,
      y: geometry.origin.y + placement.y * PX_PER_MM * geometry.scale,
      width: placement.width * PX_PER_MM * geometry.scale,
      height: placement.height * PX_PER_MM * geometry.scale,
    }
    return Object.keys(expected).every((key) => Math.abs(frame[key as keyof typeof frame] - expected[key as keyof typeof expected]) <= 1)
  })
  check('a paper places its first, third and last frames at their imposed bleed boxes', geometry.frames.length === 3 && matches, JSON.stringify(geometry))

  const second = await page.locator('#second').evaluate((paper: HTMLElement & { papers: number }) => ({
    papers: paper.papers,
    reflected: paper.dataset.papers,
    frames: paper.querySelectorAll('iframe').length,
  }))
  check(
    'a 31-label paper reports two papers and shows the one placement on paper 1',
    second.papers === 2 && second.reflected === '2' && second.frames === 1,
    JSON.stringify(second),
  )

  const rtlPlacement = impose(Imposition.parse({ ...labelsImposition, dir: 'rtl' }), 1).placements[0]
  const rtl = await page.locator('#rtl').evaluate((paper) => {
    const root = paper.querySelector('.segnavia-paper__paper')?.getBoundingClientRect()
    const frame = paper.querySelector('iframe')?.getBoundingClientRect()
    return root && frame ? { root: { x: root.x, y: root.y, width: root.width }, frame: { x: frame.x, y: frame.y } } : null
  })
  const rtlScale = rtl ? rtl.root.width / (imposed.paper.width * PX_PER_MM) : 0
  check(
    'a right-to-left imposition starts in the top right cell',
    Boolean(rtl && rtlPlacement && Math.abs(rtl.frame.x - (rtl.root.x + rtlPlacement.bleedBox.x * PX_PER_MM * rtlScale)) <= 1),
    JSON.stringify(rtl),
  )

  const firstFrame = page.locator('#first iframe').first()
  const frameBox = await firstFrame.boundingBox()
  if (!frameBox) throw new Error('The first label frame has no box.')
  const pixel = screenshotPixel(
    await page.screenshot({ clip: { x: frameBox.x + frameBox.width / 2, y: frameBox.y + frameBox.height / 2, width: 1, height: 1 } }),
  )
  check('a screenshot sample inside the first label shows its background shade', pixel[0] === 254 && pixel[1] === 243 && pixel[2] === 199, pixel.join(','))

  const before = { scale: geometry.scale, frame: geometry.frames[0] as (typeof geometry.frames)[number] }
  await page.locator('#first-container').evaluate((container: HTMLElement) => {
    container.style.width = '408px'
  })
  await page.waitForFunction(() => (document.querySelector('#first .segnavia-paper__paper') as HTMLElement).getBoundingClientRect().width < 500)
  const after = await page.locator('#first').evaluate((paper) => {
    const box = paper.querySelector('.segnavia-paper__paper') as HTMLElement
    const frame = paper.querySelector('iframe') as HTMLIFrameElement
    return { scale: box.getBoundingClientRect().width / Number.parseFloat(box.style.width), frame: frame.getBoundingClientRect().width }
  })
  check(
    'resizing the container changes the paper scale and its frames follow',
    after.scale < before.scale && after.frame < before.frame.width,
    JSON.stringify({ before, after }),
  )

  const clamped = await page.locator('#second').evaluate((paper: HTMLElement & { paper: number }) => {
    let changes = 0
    paper.addEventListener('change', () => changes++)
    paper.paper = -20
    return { paper: paper.paper, reflected: paper.getAttribute('paper'), changes }
  })
  check(
    'an out-of-range paper property clamps and fires change',
    clamped.paper === 0 && clamped.reflected === '0' && clamped.changes === 1,
    JSON.stringify(clamped),
  )

  const bare = await page.locator('#bare').evaluate((paper) => {
    const style = getComputedStyle(paper)
    return { display: style.display, position: style.position, overflow: style.overflow, aspect: style.aspectRatio }
  })
  check(
    'an unstyled paper has no geometry from the library',
    bare.display === 'inline' && bare.position === 'static' && bare.overflow === 'visible' && bare.aspect === 'auto',
    JSON.stringify(bare),
  )
  const sandboxes = await page.locator('segnavia-paper iframe').evaluateAll((frames) => frames.map((frame) => frame.getAttribute('sandbox')))
  check(
    'every paper frame is sandboxed with scripts and without same-origin',
    sandboxes.length > 0 && sandboxes.every((sandbox) => sandbox === 'allow-scripts'),
  )

  const printed = await page.evaluate(
    async ({ pages, imposition }) => {
      const bundle = '/segnavia.js'
      const lib = (await import(bundle)) as { printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void> }
      const started = performance.now()
      let papers = 0
      let frames = 0
      await lib.printPages(pages, imposition, {
        print: (win: Window) => {
          papers = win.document.querySelectorAll('.paper').length
          frames = win.document.querySelectorAll('iframe').length
        },
      })
      return { papers, frames, ms: performance.now() - started }
    },
    { pages: labelPages, imposition: labelsImposition },
  )
  check(
    'printPages settles a paper block per paper and a frame per placement before its deadline',
    printed.papers === 2 && printed.frames === 31 && printed.ms < 3500,
    JSON.stringify(printed),
  )
  await h.evidence('10-papers.png')
}
