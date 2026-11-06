// What every browser check shares: the published site, one Chromium page,
// and a check that records its result and what it saw.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'
import { chromiumPath } from '../chromium-path.ts'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const SITE = path.join(ROOT, 'out/site')
export const EVIDENCE = path.join(ROOT, 'out/evidence')
export const BOUNDED_WAIT_MS = 5000

export interface Harness {
  page: Page
  url(path: string): string
  check(what: string, ok: boolean, detail?: string): void
  // The data attributes an element mirrors its state into.
  state(selector: string): Promise<Record<string, string | undefined>>
  // The test runs in the page, so it can use only its own arguments: pass
  // anything it needs as `arg`.
  waitFor<A = undefined>(selector: string, test: (data: DOMStringMap, arg: A) => boolean, options?: { arg?: A; timeout?: number }): Promise<void>
  // A real click at the center of a frame, as a presenter makes. Playwright's
  // element click misplaces a target inside a scaled, sandboxed frame.
  clickFrame(selector: string): Promise<void>
  evidence(name: string): Promise<void>
  failures(): number
  errors: string[]
  releaseHeldFrames(): void
  close(): Promise<void>
}

export async function openHarness(): Promise<Harness> {
  mkdirSync(EVIDENCE, { recursive: true })
  const heldFrames = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      if (url.pathname === '/held-frame.html') {
        const background = url.searchParams.has('red') ? 'rgb(255,0,0)' : 'rgb(88,28,135)'
        const encoder = new TextEncoder()
        let heldController: ReadableStreamDefaultController<Uint8Array> | undefined
        return new Response(
          new ReadableStream({
            start(controller) {
              heldController = controller
              heldFrames.add(controller)
              controller.enqueue(
                encoder.encode(
                  `<!doctype html><style>html{background:${background}}</style><body style="margin:0;height:100vh;display:grid;place-items:center;color:white">held</body>`,
                ),
              )
            },
            cancel() {
              if (heldController) heldFrames.delete(heldController)
            },
          }),
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        )
      }
      const file = Bun.file(path.join(SITE, path.normalize(url.pathname.replace(/^\/$/, '/index.html'))))
      return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 })
    },
  })
  const browser: Browser = await chromium.launch({
    executablePath: chromiumPath(),
    // Recorded narration plays without a gesture, as it would after a click on Play.
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 816 } })
  await context.addInitScript(() => {
    const events: unknown[] = []
    ;(window as unknown as { __focusProbe: unknown[] }).__focusProbe = events
    const record = (type: string, detail: unknown = {}) => events.push({ at: performance.timeOrigin + performance.now(), type, detail })
    const focusDetail = (event: FocusEvent) => ({
      hasFocus: document.hasFocus(),
      target: event.target instanceof Element ? `${event.target.tagName.toLowerCase()}#${event.target.id}` : String(event.target),
      active: document.activeElement instanceof Element ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id}` : null,
      related: event.relatedTarget instanceof Element ? `${event.relatedTarget.tagName.toLowerCase()}#${event.relatedTarget.id}` : null,
      path: event.composedPath().filter((entry): entry is Element => entry instanceof Element).map((entry) => entry.tagName.toLowerCase()),
    })
    addEventListener('focus', (event) => record('focus', focusDetail(event)), true)
    addEventListener('blur', (event) => record('blur', focusDetail(event)), true)
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      addEventListener(type, (event) => record(type, {
        target: event.target instanceof Element ? event.target.tagName.toLowerCase() : String(event.target),
        x: (event as PointerEvent).clientX,
        y: (event as PointerEvent).clientY,
      }), true)
    }
    addEventListener('load', () => record('load', { hasFocus: document.hasFocus() }), true)
    addEventListener('message', (event) => {
      if ((event.data as { type?: string } | null)?.type === 'segnavia:ready') record('ready')
    })
    addEventListener('DOMContentLoaded', () => {
      new MutationObserver((records) => {
        for (const entry of records) {
          const canvas = entry.target as HTMLElement
          record('canvas-attribute', {
            attribute: entry.attributeName,
            slide: canvas.dataset.slideId,
            active: canvas.hasAttribute('data-active'),
            incoming: canvas.hasAttribute('data-incoming'),
            inert: canvas.inert,
          })
        }
      }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-active', 'data-incoming'] })
    })
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Every message a page receives, so a check that waited in vain can say
  // what did arrive.
  await page.addInitScript(() => {
    const seen: string[] = []
    Object.defineProperty(window, '__messages', { value: seen })
    window.addEventListener('message', (event) => seen.push(String((event.data as { type?: unknown })?.type)))
  })
  let failed = 0
  return {
    page,
    errors,
    releaseHeldFrames() {
      for (const controller of heldFrames) controller.close()
      heldFrames.clear()
    },
    url: (file) => `http://localhost:${server.port}/${file}`,
    check(what, ok, detail = '') {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`)
      if (!ok) failed++
    },
    state: (selector) => page.locator(selector).evaluate((element: HTMLElement) => ({ ...element.dataset })),
    async waitFor(selector, test, options = {}) {
      await page
        .waitForFunction(
          ([css, body, arg]) => {
            const element = document.querySelector(css as string) as HTMLElement | null
            // The test arrives as source, since a function cannot cross into the page.
            return element ? new Function('data', 'arg', `return (${body})(data, arg)`)(element.dataset, arg) : false
          },
          [selector, test.toString(), options.arg] as const,
          { timeout: options.timeout ?? 20000 },
        )
        .catch(() => {})
    },
    async clickFrame(selector) {
      const box = await page.locator(selector).boundingBox({ timeout: 20000 })
      if (!box) throw new Error(`${selector} has no box to click.`)
      const clickedAt = Date.now()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      // A sandboxed frame runs in its own process, so focus reaches it after
      // the click returns. A key pressed before then goes to the host page.
      const frame = await (await page.locator(selector).elementHandle())?.contentFrame()
      if (!frame) throw new Error(`${selector} has no frame to focus.`)
      let focused = true
      await frame.waitForFunction(() => document.hasFocus(), undefined, { timeout: BOUNDED_WAIT_MS }).catch(() => {
        focused = false
      })
      const handles = await page.locator(selector).elementHandles()
      const frames = (await Promise.all(handles.map((handle) => handle.contentFrame()))).filter((candidate) => candidate !== null)
      const facts = await Promise.all([
        page.evaluate(() => {
          const player = document.querySelector('segnavia-player')
          const shadowActive = player?.shadowRoot?.activeElement
          return { focus: document.hasFocus(), active: document.activeElement instanceof Element ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id}` : null, shadowActive: shadowActive instanceof Element ? `${shadowActive.tagName.toLowerCase()}#${shadowActive.id}` : null, events: (window as unknown as { __focusProbe?: unknown[] }).__focusProbe ?? [] }
        }),
        page.locator(selector).evaluateAll((iframes) => iframes.map((iframe, index) => {
          const canvas = iframe.closest('.segnavia-stage__canvas') as HTMLElement | null
          const rect = iframe.getBoundingClientRect()
          return { index, slide: canvas?.dataset.slideId, active: canvas?.hasAttribute('data-active'), incoming: canvas?.hasAttribute('data-incoming'), inert: canvas?.inert, opacity: canvas ? getComputedStyle(canvas).opacity : null, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
        })),
        ...frames.map((candidate) => candidate.evaluate(() => ({ focus: document.hasFocus(), active: document.activeElement instanceof Element ? `${document.activeElement.tagName.toLowerCase()}#${document.activeElement.id}` : null, events: (window as unknown as { __focusProbe?: unknown[] }).__focusProbe ?? [] }))),
      ])
      console.error(focused ? 'FOCUS_PROBE_PASS' : 'FOCUS_PROBE_FAIL', JSON.stringify({ selector, clickedAt, clickedBox: box, facts }))
      if (!focused) throw new Error(`${selector} did not take focus within ${BOUNDED_WAIT_MS} ms of the click.`)
    },
    evidence: async (name) => {
      await page.screenshot({ path: path.join(EVIDENCE, name) })
    },
    failures: () => failed,
    async close() {
      await browser.close()
      server.stop()
    },
  }
}
