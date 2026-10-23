import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const html = readFileSync(new URL('../fixtures/fidelity/glass-ui.html', import.meta.url), 'utf8')
const out = process.argv[2]
if (!out) throw new Error('usage: probe-screen.ts <out.png>')
const browser = await chromium.launch({
  executablePath: process.env.SEGNAVIA_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log('wrote', out)
