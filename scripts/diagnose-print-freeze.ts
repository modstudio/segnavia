import { chromium } from 'playwright-core'
import { printableDeck } from '../packages/frame/src/print-document.ts'

const executablePath = process.env.SEGNAVIA_CHROMIUM
if (!executablePath) throw new Error('SEGNAVIA_CHROMIUM is required')
const browser = await chromium.launch({ executablePath, headless: true })
try {
  for (let run = 0; run < 20; run++) {
    const page = await browser.newPage()
    const slides = Array.from({ length: 40 }, (_, index) => ({
      id: `slide-${index}`,
      printAtMs: index % 2 ? 500 : 0,
      content: {
        kind: 'html' as const,
        html: '<style>@keyframes fade{from{opacity:0}to{opacity:1}}#target{animation:fade 1s linear both}</style><div id="target">Animated</div>',
      },
    }))
    const html = printableDeck({ title: 'diagnostic', scripts: 'refuse', size: { width: 400, height: 200 }, fit: 'contain', frame: false, slides })
    await page.setContent(html)
    await page.waitForFunction(() => document.querySelectorAll('iframe').length === 40)
    await Promise.all(page.frames().slice(1).map((frame) => frame.locator('html[data-segnavia-print-ready]').waitFor()))
    await page.waitForTimeout(125)
    const facts = await Promise.all(
      page.frames().slice(1).map((frame) =>
        frame.locator('#target').evaluate((target) => ({ opacity: getComputedStyle(target).opacity, time: document.getAnimations()[0]?.currentTime, playState: document.getAnimations()[0]?.playState })),
      ),
    )
    const bad = facts.map((fact, index) => ({ index, desired: index % 2 ? 500 : 0, ...fact })).filter((fact) => Math.abs(Number(fact.time) - fact.desired) > 0.01)
    console.log(JSON.stringify({ run, bad: bad.length, sample: bad.slice(0, 4) }))
    await page.close()
  }
} finally {
  await browser.close()
}
