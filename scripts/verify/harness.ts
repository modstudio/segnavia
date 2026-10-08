// What every browser check shares: the published site, one Chromium page,
// and a check that records its result and what it saw.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium, type Page } from 'playwright-core'

export const ROOT = path.resolve(import.meta.dir, '../..')
export const SITE = path.join(ROOT, 'out/site')
export const EVIDENCE = path.join(ROOT, 'out/evidence')

export interface Harness {
  page: Page
  url(path: string): string
  check(what: string, ok: boolean, detail?: string): void
  // The data attributes an element mirrors its state into.
  state(selector: string): Promise<Record<string, string | undefined>>
  // The test runs in the page, so it can use only its own arguments: pass
  // anything it needs as `arg`.
  waitFor<A = undefined>(selector: string, test: (data: DOMStringMap, arg: A) => boolean, options?: { arg?: A; timeout?: number }): Promise<void>
  // A real click at the centre of a frame, as a presenter makes. Playwright's
  // element click misplaces a target inside a scaled, sandboxed frame.
  clickFrame(selector: string): Promise<void>
  evidence(name: string): Promise<void>
  failures(): number
  errors: string[]
  close(): Promise<void>
}

export async function openHarness(): Promise<Harness> {
  mkdirSync(EVIDENCE, { recursive: true })
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url)
      const file = Bun.file(path.join(SITE, path.normalize(url.pathname.replace(/^\/$/, '/index.html'))))
      return (await file.exists()) ? new Response(file) : new Response('Not found', { status: 404 })
    },
  })
  const browser: Browser = await chromium.launch({
    executablePath: process.env.SEGNAVIA_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    // Recorded narration plays without a gesture, as it would after a click on Play.
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 816 } })
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
      const box = await page.locator(selector).boundingBox()
      if (!box) throw new Error(`${selector} has no box to click.`)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
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
