// Papers: placement geometry, scaling, direction, sandboxing, unstyled use
// and the browser print path for imposed pages.

import { inflateSync } from 'node:zlib'
import { Imposition, impose, PX_PER_MM } from '@segnavia/format'
import { labelPages, labelsImposition, twoSidedCardImposition } from '../demo-page-fixtures.ts'
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

async function waitForScreenshotPixel(
  screenshot: () => Promise<Uint8Array>,
  expected: readonly [number, number, number],
  timeoutMs = 5000,
): Promise<[number, number, number]> {
  const deadline = performance.now() + timeoutMs
  let pixel: [number, number, number] = [0, 0, 0]
  do {
    pixel = screenshotPixel(await screenshot())
    if (pixel.every((channel, index) => channel === expected[index])) return pixel
    await new Promise((resolve) => setTimeout(resolve, 16))
  } while (performance.now() < deadline)
  return pixel
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

  const cardsImposed = impose(Imposition.parse(twoSidedCardImposition), 8)
  const cards = await page.locator('#cards-front,#declared-back,#property-back').evaluateAll((papers) =>
    papers.map((paper) => {
      const root = paper.querySelector('.segnavia-paper__paper') as HTMLElement
      const origin = root.getBoundingClientRect()
      return {
        side: paper.getAttribute('side'),
        sides: (paper as HTMLElement).dataset.sides,
        scale: origin.width / Number.parseFloat(root.style.width),
        origin: { x: origin.x, y: origin.y },
        frames: [...paper.querySelectorAll('iframe')].map((frame) => {
          const rect = frame.getBoundingClientRect()
          return { x: rect.x, y: rect.y }
        }),
      }
    }),
  )
  const cardsMatch = cards.every((shown) => {
    const placements = cardsImposed.placements.filter((placement) => placement.side === shown.side)
    return shown.frames.every((frame, index) => {
      const placement = placements[index]
      return (
        placement !== undefined &&
        Math.abs(frame.x - (shown.origin.x + placement.bleedBox.x * PX_PER_MM * shown.scale)) <= 1 &&
        Math.abs(frame.y - (shown.origin.y + placement.bleedBox.y * PX_PER_MM * shown.scale)) <= 1
      )
    })
  })
  check(
    'declarative and property back sides requested before load survive a two-sided load',
    cards.length === 3 && cards.every((shown) => shown.frames.length === 4 && shown.sides === '2') && cardsMatch,
    JSON.stringify(cards),
  )

  const oneSidedBack = await page.locator('#declared-back,#property-back').evaluateAll(
    (papers, { pages, imposition }) =>
      papers.map((paper) => {
        const element = paper as HTMLElement & { load: (pages: unknown[], imposition: unknown) => void; side: string }
        element.load(pages, imposition)
        return { side: element.side, reflected: element.getAttribute('side'), sides: element.dataset.sides }
      }),
    { pages: labelPages.slice(0, 1), imposition: labelsImposition },
  )
  check(
    'declarative and property back sides requested before load fall back to front on a one-sided load',
    oneSidedBack.length === 2 && oneSidedBack.every((shown) => shown.side === 'front' && shown.reflected === 'front' && shown.sides === '1'),
    JSON.stringify(oneSidedBack),
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

  await page.waitForFunction(() => {
    const messages = (window as Window & { __messages?: string[] }).__messages ?? []
    const frames = document.querySelectorAll('iframe').length
    return frames > 0 && messages.filter((message) => message === 'segnavia:ready').length >= frames
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const firstFrame = page.locator('#first iframe').first()
  const frameBox = await firstFrame.boundingBox()
  if (!frameBox) throw new Error('The first label frame has no box.')
  const pixel = await waitForScreenshotPixel(
    () => page.screenshot({ clip: { x: frameBox.x + frameBox.width / 2, y: frameBox.y + frameBox.height / 2, width: 1, height: 1 } }),
    [254, 243, 199],
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

  const hostileHtml =
    `"><img id="segnavia-hostile-html" src="x" onerror="window.__segnaviaHostile=true"></iframe>` +
    '<script>window.__segnaviaHostile=true;document.body.insertAdjacentHTML("beforeend","<i id=segnavia-hostile-script></i>")</script>'
  const hostileLang = '"><img id="segnavia-hostile-lang" src="x" onerror="window.__segnaviaHostile=true">'
  const hostilePaper = await page.evaluate(
    async ({ html, lang, imposition }) => {
      const host = window as Window & { __segnaviaHostile?: boolean }
      delete host.__segnaviaHostile
      const paper = document.createElement('segnavia-paper') as HTMLElement & {
        load: (pages: unknown[], imposition: unknown) => void
      }
      document.body.append(paper)
      paper.load([{ html, lang, scripts: 'sandboxed' }], imposition)
      await new Promise((resolve) => setTimeout(resolve, 100))
      let dirRefused = false
      try {
        paper.load([{ html: '<p>refused</p>', dir: lang }], imposition)
      } catch {
        dirRefused = true
      }
      return {
        dirRefused,
        frames: paper.querySelectorAll('iframe').length,
        sandbox: paper.querySelector('iframe')?.getAttribute('sandbox'),
        hostNodes: document.querySelectorAll('#segnavia-hostile-html,#segnavia-hostile-script,#segnavia-hostile-lang').length,
        hostMarker: host.__segnaviaHostile === true,
      }
    },
    { html: hostileHtml, lang: hostileLang, imposition: labelsImposition },
  )
  check(
    'a paper keeps hostile page HTML and language inside its one sandboxed frame and refuses an invalid direction',
    hostilePaper.dirRefused &&
      hostilePaper.frames === 1 &&
      hostilePaper.sandbox === 'allow-scripts' &&
      hostilePaper.hostNodes === 0 &&
      !hostilePaper.hostMarker,
    JSON.stringify(hostilePaper),
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

  const hostilePrinted = await page.evaluate(
    async ({ html, lang, imposition }) => {
      const bundle = '/segnavia.js'
      const lib = (await import(bundle)) as { printPages: (pages: unknown[], imposition: unknown, options: unknown) => Promise<void> }
      let result = { frames: 0, sandbox: null as string | null, hostNodes: 0, hostMarker: false }
      await lib.printPages([{ html, lang, scripts: 'sandboxed' }], imposition, {
        print: (win: Window) => {
          const host = win as Window & { __segnaviaHostile?: boolean }
          const frames = [...win.document.querySelectorAll('iframe')]
          result = {
            frames: frames.length,
            sandbox: frames[0]?.getAttribute('sandbox') ?? null,
            hostNodes: win.document.querySelectorAll('#segnavia-hostile-html,#segnavia-hostile-script,#segnavia-hostile-lang').length,
            hostMarker: host.__segnaviaHostile === true,
          }
        },
      })
      return result
    },
    { html: hostileHtml, lang: hostileLang, imposition: labelsImposition },
  )
  check(
    'printPages keeps hostile page HTML and language inside its one sandboxed frame',
    hostilePrinted.frames === 1 && hostilePrinted.sandbox === 'allow-scripts' && hostilePrinted.hostNodes === 0 && !hostilePrinted.hostMarker,
    JSON.stringify(hostilePrinted),
  )
  await h.evidence('10-papers.png')
}
