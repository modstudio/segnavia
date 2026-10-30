import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SCRIPTED_CHART_URL, SCRIPTED_FONT_CSS_URL, SCRIPTED_FONT_URL } from '../build-scripted-dependency-demo.ts'
import type { Harness } from './harness.ts'

export async function verifyScriptedDependencies(h: Harness) {
  const { page, check } = h
  const requests = new Set<string>()
  const answered = new Set<string>()
  const fixtures = new Map<string, { body: Buffer; contentType: string }>([
    [
      SCRIPTED_CHART_URL,
      { body: readFileSync(path.join(import.meta.dir, '../../fixtures/scripted-dependencies/chart-stub.js')), contentType: 'text/javascript' },
    ],
    [SCRIPTED_FONT_CSS_URL, { body: readFileSync(path.join(import.meta.dir, '../../fixtures/scripted-dependencies/font.css')), contentType: 'text/css' }],
    [SCRIPTED_FONT_URL, { body: readFileSync(path.join(import.meta.dir, '../../fixtures/hebrew-notice/Alef-Regular.ttf')), contentType: 'font/ttf' }],
  ])
  await page.route(/^https:\/\//, async (route) => {
    const url = route.request().url()
    requests.add(url)
    const fixture = fixtures.get(url)
    if (fixture) {
      answered.add(url)
      await route.fulfill({
        status: 200,
        body: fixture.body,
        headers: { 'content-type': fixture.contentType, 'access-control-allow-origin': '*' },
      })
      return
    }
    await route.abort('blockedbyclient')
  })
  await page.goto(h.url('scripted-dependencies.html'))
  const frame = page.frameLocator('#scripted-dependencies iframe')
  await frame.locator('#fetch').filter({ hasText: 'Fetch refused' }).waitFor()
  const messages = await page.evaluate(() => (window as unknown as { __messages: string[] }).__messages)
  check('the scripted page frame reports ready after the storage shim runs', messages.includes('segnavia:ready'), messages.join(','))
  check('the routed chart stub draws its chart on screen', await frame.locator('#chart-rendered').isVisible())
  await frame.locator('#topic').selectOption({ label: 'Math' })
  await frame.locator('#name').fill('Noah')
  await frame.locator('form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  const submitted = await frame.locator('#submitted').textContent()
  check('the scripted form submit handler writes the chosen values', submitted === 'Math for Noah', submitted ?? '')
  check('local and session storage round trip in the opaque-origin frame', (await frame.locator('#storage').textContent()) === 'local-ok / session-ok')
  check('an unapproved fetch is refused', (await frame.locator('#fetch').textContent()) === 'Fetch refused')
  await frame
    .locator('html[data-font-css=loaded]')
    .waitFor({ timeout: 3000 })
    .catch(() => {})
  const font = await frame.locator('body').evaluate(async () => {
    await document.fonts.load('16px "Scripted Demo Fixture"')
    return { family: getComputedStyle(document.body).fontFamily, loaded: document.fonts.check('16px "Scripted Demo Fixture"') }
  })
  check(
    'the approved stylesheet and font requests are made and answered from fixtures',
    [SCRIPTED_FONT_CSS_URL, SCRIPTED_FONT_URL].every((url) => requests.has(url) && answered.has(url)),
    JSON.stringify({ requests: [...requests], answered: [...answered] }),
  )
  check(
    'the routed fixture font is in use',
    answered.has(SCRIPTED_FONT_URL) && font.loaded && font.family.startsWith('"Scripted Demo Fixture"'),
    JSON.stringify(font),
  )
}
