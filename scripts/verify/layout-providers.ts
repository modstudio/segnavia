import { PREFLIGHT_ATTRIBUTE } from '@segnavia/frame/book-document'
import { LAYOUT_PHASE_TIMEOUT_MS } from '@segnavia/frame/layout'
import type { Harness } from './harness.ts'

type Plan = { pages?: Array<{ windows?: Array<{ flow?: string }> }> }

async function bookFacts(h: Harness, name: string) {
  await h.page.goto(h.url(`layout-provider-book-${name}.html`))
  await h.page.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))
  return h.page.evaluate((preflightAttribute) => {
    const plan = JSON.parse(document.querySelector('script[data-segnavia-plan]')?.textContent ?? 'null') as Plan | null
    const report = JSON.parse(document.documentElement.getAttribute(preflightAttribute) ?? 'null') as { issues?: Array<{ check?: string }> } | null
    return {
      pages: document.querySelectorAll('[data-segnavia-book-page]').length,
      laterPage: Number(
        document.querySelector('[data-segnavia-pages] [data-layout-later]')?.closest('[data-segnavia-book-page]')?.getAttribute('data-segnavia-book-page'),
      ),
      plan,
      galley: document.querySelector('[data-galley-ran]') !== null,
      composed: document.querySelector('[data-composed-ran]') !== null,
      overset: report?.issues?.some((issue) => issue.check === 'region-overset' || issue.check === 'furniture-overset') ?? false,
    }
  }, PREFLIGHT_ATTRIBUTE)
}

function samePlan(left: Plan | null, right: Plan | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

type FrameLike = { locator(selector: string): { evaluate<T>(body: (element: Element) => T): Promise<T> } }

async function layoutBox(frame: FrameLike): Promise<{ x: number; y: number; width: number; height: number }> {
  return frame.locator('[data-layout-box]').evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
}

const close = (left: number, right: number) => Math.abs(left - right) <= 0.5
const boxesAgree = (left: Awaited<ReturnType<typeof layoutBox>>, right: Awaited<ReturnType<typeof layoutBox>>) =>
  close(left.x, right.x) && close(left.y, right.y) && close(left.width, right.width) && close(left.height, right.height)
const boxEdgesAgree = (left: Awaited<ReturnType<typeof layoutBox>>, right: Awaited<ReturnType<typeof layoutBox>>) =>
  close(left.x, right.x) && close(left.y, right.y) && close(left.x + left.width, right.x + right.width) && close(left.y + left.height, right.y + right.height)

export async function verifyLayoutProviders(h: Harness): Promise<void> {
  const baseline = await bookFacts(h, 'baseline')
  const galley = await bookFacts(h, 'galley')
  const composed = await bookFacts(h, 'composed')
  h.check(
    'a galley layout changes book pagination',
    baseline.pages !== galley.pages || baseline.laterPage !== galley.laterPage,
    `${baseline.pages} -> ${galley.pages} pages; later block ${baseline.laterPage} -> ${galley.laterPage}`,
  )
  h.check('a composed layout does not re-paginate', samePlan(baseline.plan, composed.plan), `${baseline.pages} and ${composed.pages} pages`)
  h.check('overflow caused in composed is reported by preflight', composed.overset, `overset=${composed.overset}`)

  const measured = await bookFacts(h, 'measure')
  h.check(
    'a measure-only book runs galley and skips composed',
    measured.galley && !measured.composed,
    `galley=${measured.galley}, composed=${measured.composed}`,
  )

  await h.page.goto(h.url('layout-provider-book-hebrew.html'))
  await h.page.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))
  const hebrew = await h.page.locator('[data-segnavia-galley-source] [data-layout-measurements]').evaluate((element: HTMLElement) => {
    const measured = JSON.parse(element.dataset.layoutMeasurements ?? 'null') as {
      pointed: { x: number; y: number; width: number; height: number }
      plain: { x: number; y: number; width: number; height: number }
      lineBoxes: number
    }
    const lines = new Set<number>()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode() as Text | null
    while (text) {
      for (let index = 0; index < text.length; index++) {
        const range = document.createRange()
        range.setStart(text, index)
        range.setEnd(text, index + 1)
        for (const rect of range.getClientRects()) lines.add(Math.round(rect.top * 2) / 2)
      }
      text = walker.nextNode() as Text | null
    }
    return { ...measured, lines: lines.size }
  })
  const inkDelta = Math.max(Math.abs(hebrew.pointed.width - hebrew.plain.width), Math.abs(hebrew.pointed.height - hebrew.plain.height))
  h.check('pointed and plain Hebrew have the same ink box', inkDelta <= 0.5, `max delta ${inkDelta.toFixed(3)}px`)
  h.check('layout lineBoxes agrees with the paragraph line count', hebrew.lineBoxes === hebrew.lines, `${hebrew.lineBoxes} and ${hebrew.lines} lines`)

  const vertical = await h.page.locator('[data-segnavia-galley-source] [data-layout-vertical-measurements]').evaluate((element: HTMLElement) => {
    const measured = JSON.parse(element.dataset.layoutVerticalMeasurements ?? 'null') as {
      ink: { x: number; y: number; width: number; height: number }
      lineBoxes: number
    }
    const text = element.firstChild as Text
    const value = 'vertical'
    const start = text.data.indexOf(value)
    const range = document.createRange()
    range.setStart(text, start)
    range.setEnd(text, start + value.length)
    const rects = Array.from(range.getClientRects())
    const left = Math.min(...rects.map((rect) => rect.left))
    const top = Math.min(...rects.map((rect) => rect.top))
    const right = Math.max(...rects.map((rect) => rect.right))
    const bottom = Math.max(...rects.map((rect) => rect.bottom))
    const origin = element.getBoundingClientRect()
    const columns = new Set<number>()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      for (let index = 0; index < node.length; index++) {
        const character = document.createRange()
        character.setStart(node, index)
        character.setEnd(node, index + 1)
        for (const rect of character.getClientRects()) columns.add(Math.round(rect.left * 2) / 2)
      }
      node = walker.nextNode() as Text | null
    }
    return { ...measured, hand: { x: left - origin.x, y: top - origin.y, width: right - left, height: bottom - top }, columns: columns.size }
  })
  h.check(
    'vertical ink and lineBoxes agree with hand measurements',
    boxEdgesAgree(vertical.ink, vertical.hand) && vertical.lineBoxes === vertical.columns,
    JSON.stringify(vertical),
  )

  await h.page.goto(h.url('layout-provider.html'))
  await h.page.locator('#layout-page iframe').waitFor()
  const pageFrame = h.page.locator('#layout-page iframe').contentFrame()
  const slideFrame = h.page.locator('#layout-slide iframe').contentFrame()
  await pageFrame.locator('[data-layout-box]').waitFor()
  await slideFrame.locator('[data-layout-box]').waitFor()
  const screenPage = await layoutBox(pageFrame)
  const screenSlide = await layoutBox(slideFrame)
  await h.page.goto(h.url('layout-provider-book-geometry.html'))
  await h.page.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))
  const screenBook = await layoutBox(h.page)
  await h.page.emulateMedia({ media: 'print' })
  const printBook = await layoutBox(h.page)
  await h.page.emulateMedia({ media: 'screen' })
  await h.page.goto(h.url('layout-provider.html'))
  const pageFramePrint = h.page.locator('#layout-page iframe').contentFrame()
  const slideFramePrint = h.page.locator('#layout-slide iframe').contentFrame()
  await pageFramePrint.locator('[data-layout-box]').waitFor()
  await slideFramePrint.locator('[data-layout-box]').waitFor()
  await h.page.emulateMedia({ media: 'print' })
  const printPage = await layoutBox(pageFramePrint)
  const printSlide = await layoutBox(slideFramePrint)
  await h.page.emulateMedia({ media: 'screen' })
  h.check(
    'the fixture box has the same unscaled position in book, printed page, and slide screen and print media',
    boxesAgree(screenPage, screenSlide) &&
      boxesAgree(screenPage, screenBook) &&
      boxesAgree(screenBook, printBook) &&
      boxesAgree(screenPage, printPage) &&
      boxesAgree(screenSlide, printSlide),
    JSON.stringify({ screenBook, screenPage, screenSlide, printBook, printPage, printSlide }),
  )

  await h.page.setViewportSize({ width: 100, height: 816 })
  await h.page.goto(h.url('layout-provider-book-geometry.html'))
  await h.page.waitForFunction(() => document.documentElement.hasAttribute('data-segnavia-composed'))
  const narrow = await h.page
    .locator('[data-layout-geometry]')
    .first()
    .evaluate((element: HTMLElement) => {
      const report = JSON.parse(document.documentElement.getAttribute('data-segnavia-preflight') ?? 'null') as {
        issues?: Array<{ check?: string }>
      } | null
      return {
        galley: JSON.parse(element.dataset.galleyMeasurements ?? 'null') as Awaited<ReturnType<typeof layoutBox>>,
        composed: JSON.parse(element.dataset.composedMeasurements ?? 'null') as Awaited<ReturnType<typeof layoutBox>>,
        overset: report?.issues?.some((issue) => issue.check === 'region-overset' || issue.check === 'furniture-overset') ?? false,
      }
    })
  h.check(
    'a narrow book measures composed providers before screen scaling and still reports composed overflow',
    boxesAgree(narrow.galley, narrow.composed) && narrow.overset,
    JSON.stringify(narrow),
  )
  await h.page.setViewportSize({ width: 1280, height: 816 })
  await h.page.goto(h.url('layout-provider.html'))

  await h.waitFor('#reject-page', (data) => Boolean(data.error))
  await h.waitFor('#reject-slide', (data) => Boolean(data.error))
  const errors = await h.page.evaluate(() =>
    ['reject-page', 'reject-slide'].map((id) => {
      const element = document.getElementById(id) as HTMLElement
      return { message: element.dataset.error ?? '', elapsedMs: Number(element.dataset.elapsed) }
    }),
  )
  for (const [index, kind] of ['plain page', 'slide'].entries()) {
    const refusal = errors[index] ?? { message: '', elapsedMs: Number.NaN }
    h.check(
      `${kind} rejecting provider refuses through its error event without waiting out the readiness bound`,
      refusal.message.includes('demo-layout-rejecting') && refusal.message.includes('galley') && refusal.elapsedMs < LAYOUT_PHASE_TIMEOUT_MS,
      `${refusal.message} (${refusal.elapsedMs.toFixed(1)}ms)`,
    )
  }
  const rendered = (await h.page.evaluate(async () => (await fetch('layout-provider-render-refusals.json')).json())) as Record<
    string,
    { message: string; elapsedMs: number }
  >
  for (const kind of ['page', 'slide']) {
    const refusal = rendered[kind] ?? { message: '', elapsedMs: Number.NaN }
    h.check(
      `${kind} rejecting provider refuses in render without waiting out the readiness bound`,
      refusal.message.includes('demo-layout-rejecting') && refusal.message.includes('galley') && refusal.elapsedMs < LAYOUT_PHASE_TIMEOUT_MS,
      `${refusal.message} (${refusal.elapsedMs.toFixed(1)}ms)`,
    )
  }
}
