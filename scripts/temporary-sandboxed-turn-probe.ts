// TEMPORARY CI PROBE: remove this file, its deck-host fixture hook, and its CI job after Linux evidence is collected.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import type { Page } from 'playwright-core'
import { BOUNDED_WAIT_MS, EVIDENCE, type Harness, openHarness } from './verify/harness.ts'

const STAGE = '#deck'
const REPORT_DIRECTORY = path.join(EVIDENCE, 'sandboxed-turn-probe')
const REUSED_TURNS = count('SEGNAVIA_PROBE_TURNS', 500)
const FRESH_CYCLES = count('SEGNAVIA_PROBE_FRESH_CYCLES', 100)

interface CanvasState {
  id?: string
  active: boolean
  incoming: boolean
  opacity: string
}

interface ProbeEvent {
  at: number
  kind: string
  slide?: string
  canvases: CanvasState[]
}

interface Capture {
  sequence: number
  group: 'reused' | 'fresh'
  iteration: number
  target: string
  phase: 'turn' | 'settled'
  screenshotStart: number
  screenshotEnd: number
  pixel: [number, number, number]
  bare: boolean
  canvases: CanvasState[]
  eventCount: number
}

interface BareEvidence {
  capture: number
  original: string
  images: Array<{ frame: number; path: string; screenshotStart: number; screenshotEnd: number; canvases: CanvasState[]; eventCount: number }>
}

interface ProbeState {
  events: ProbeEvent[]
}

const harness = await openHarness()
const captures: Capture[] = []
const bareEvidence: BareEvidence[] = []
mkdirSync(REPORT_DIRECTORY, { recursive: true })
try {
  await harness.page.goto(harness.url('deck-host.html'))
  await harness.page.waitForFunction(() => Boolean(Reflect.get(window, '__deckHost')))
  await installInstrumentation(harness.page)
  await loadSandboxed(harness.page)

  for (let turn = 0; turn < REUSED_TURNS; turn++) {
    const index = [1, 2, 0][turn % 3] ?? 0
    await captureTurn(harness, 'reused', turn, index, captures, bareEvidence)
  }
  for (let cycle = 0; cycle < FRESH_CYCLES; cycle++) {
    await loadSandboxed(harness.page)
    await captureTurn(harness, 'fresh', cycle, 1, captures, bareEvidence)
    await captureTurn(harness, 'fresh', cycle, 2, captures, bareEvidence)
  }

  const events = await probeEvents(harness.page)
  const report = {
    settings: { reusedTurns: REUSED_TURNS, freshCycles: FRESH_CYCLES },
    summary: { captures: captures.length, bare: captures.filter(({ bare }) => bare).length, events: events.length },
    captures,
    events,
    bareEvidence,
  }
  const reportPath = path.join(REPORT_DIRECTORY, 'report.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`sandboxed-turn probe: captures=${report.summary.captures} bare=${report.summary.bare} events=${report.summary.events}`)
  console.log(`sandboxed-turn probe report: ${reportPath}`)
} finally {
  await harness.close()
}

function count(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must be a non-negative integer; received ${value}`)
  return parsed
}

async function installInstrumentation(page: Page) {
  await page.evaluate(() => {
    const stage = document.querySelector('#deck')
    if (!(stage instanceof HTMLElement)) throw new Error('The deck stage is missing.')
    const state: ProbeState = { events: [] }
    Object.defineProperty(window, '__sandboxedTurnProbe', { configurable: true, value: state })
    const canvases = (): CanvasState[] =>
      [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].map((canvas) => ({
        id: canvas.dataset.slideId,
        active: canvas.hasAttribute('data-active'),
        incoming: canvas.hasAttribute('data-incoming'),
        opacity: getComputedStyle(canvas).opacity,
      }))
    const record = (kind: string, slide?: string) => state.events.push({ at: performance.now(), kind, slide, canvases: canvases() })
    const watched = new WeakSet<HTMLIFrameElement>()
    const watch = (frame: HTMLIFrameElement) => {
      if (watched.has(frame)) return
      watched.add(frame)
      frame.addEventListener('load', () => record('parent-load', frame.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId), {
        once: true,
      })
    }
    const scan = (root: ParentNode) => {
      if (root instanceof HTMLIFrameElement) watch(root)
      for (const frame of root.querySelectorAll<HTMLIFrameElement>('iframe')) watch(frame)
    }
    scan(stage)
    const observer = new MutationObserver((records) => {
      for (const mutation of records) {
        if (mutation.type === 'attributes') {
          const canvas = mutation.target as HTMLElement
          record(`canvas-${mutation.attributeName}`, canvas.dataset.slideId)
        }
        for (const node of mutation.addedNodes) if (node instanceof HTMLElement) scan(node)
      }
    })
    observer.observe(stage, {
      attributes: true,
      attributeFilter: ['data-active', 'data-incoming', 'style'],
      childList: true,
      subtree: true,
    })
    window.addEventListener('message', (event) => {
      const frame = [...stage.querySelectorAll<HTMLIFrameElement>('iframe')].find((candidate) => candidate.contentWindow === event.source)
      const slide = frame?.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId
      if (event.data?.type === 'segnavia:ready') record('ready-arrival', slide)
      if (event.data?.type === 'sandboxed-turn-probe:first-raf') record('child-first-raf', slide)
    })
    record('instrumentation-installed')
  })
}

async function loadSandboxed(page: Page) {
  await page.evaluate(async () => {
    const host = Reflect.get(window, '__deckHost') as { loadSandboxedProbe(): Promise<void> }
    await host.loadSandboxedProbe()
  })
  await page.waitForFunction(() => document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'sandboxed-1')
}

async function captureTurn(harness: Harness, group: Capture['group'], iteration: number, index: number, captures: Capture[], evidence: BareEvidence[]) {
  const target = `sandboxed-${index + 1}`
  await harness.page.evaluate((next) => {
    const host = Reflect.get(window, '__deckHost') as { controller: { go(index: number): Promise<void> } }
    void host.controller.go(next)
  }, index)
  let active = ''
  const deadline = performance.now() + BOUNDED_WAIT_MS
  while (active !== target) {
    if (performance.now() >= deadline) throw new Error(`The turn to ${target} did not finish within ${BOUNDED_WAIT_MS} ms.`)
    const capture = await capturePixel(harness.page, group, iteration, target, 'turn', captures.length)
    captures.push(capture)
    if (capture.bare) evidence.push(await saveBareEvidence(harness.page, capture))
    active = capture.canvases.find((canvas) => canvas.active)?.id ?? ''
  }
  for (let settled = 0; settled < 2; settled++) {
    const capture = await capturePixel(harness.page, group, iteration, target, 'settled', captures.length)
    captures.push(capture)
    if (capture.bare) evidence.push(await saveBareEvidence(harness.page, capture))
  }
}

async function capturePixel(
  page: Page,
  group: Capture['group'],
  iteration: number,
  target: string,
  phase: Capture['phase'],
  sequence: number,
): Promise<Capture> {
  const box = await page.locator(STAGE).boundingBox()
  if (!box) throw new Error('The deck stage has no box.')
  const screenshotStart = await page.evaluate(() => performance.now())
  const png = await page.screenshot({ clip: { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 1, height: 1 } })
  const snapshot = await page.locator(STAGE).evaluate((stage) => ({
    screenshotEnd: performance.now(),
    canvases: [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].map((canvas) => ({
      id: canvas.dataset.slideId,
      active: canvas.hasAttribute('data-active'),
      incoming: canvas.hasAttribute('data-incoming'),
      opacity: getComputedStyle(canvas).opacity,
    })),
    eventCount: (Reflect.get(window, '__sandboxedTurnProbe') as ProbeState).events.length,
  }))
  const pixel = screenshotPixel(png)
  const bare = barePixel(pixel)
  if (bare) writeFileSync(path.join(REPORT_DIRECTORY, `bare-${String(sequence).padStart(5, '0')}-pixel.png`), png)
  return { sequence, group, iteration, target, phase, screenshotStart, ...snapshot, pixel, bare }
}

async function saveBareEvidence(page: Page, capture: Capture): Promise<BareEvidence> {
  const stem = `bare-${String(capture.sequence).padStart(5, '0')}`
  const images: BareEvidence['images'] = []
  for (let frame = 1; frame <= 2; frame++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const screenshotStart = await page.evaluate(() => performance.now())
    const imagePath = path.join(REPORT_DIRECTORY, `${stem}-frame-${frame}.png`)
    await page.locator(STAGE).screenshot({ path: imagePath })
    const snapshot = await page.locator(STAGE).evaluate((stage) => ({
      screenshotEnd: performance.now(),
      canvases: [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].map((canvas) => ({
        id: canvas.dataset.slideId,
        active: canvas.hasAttribute('data-active'),
        incoming: canvas.hasAttribute('data-incoming'),
        opacity: getComputedStyle(canvas).opacity,
      })),
      eventCount: (Reflect.get(window, '__sandboxedTurnProbe') as ProbeState).events.length,
    }))
    images.push({ frame, path: path.basename(imagePath), screenshotStart, ...snapshot })
  }
  return { capture: capture.sequence, original: `${stem}-pixel.png`, images }
}

async function probeEvents(page: Page): Promise<ProbeEvent[]> {
  return page.evaluate(() => (Reflect.get(window, '__sandboxedTurnProbe') as ProbeState).events)
}

function barePixel([red, green, blue]: [number, number, number]): boolean {
  return Math.abs(red - 238) < 3 && Math.abs(green - 238) < 3 && Math.abs(blue - 238) < 3
}

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
