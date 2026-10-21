import { PX_PER_MM } from '@segnavia/format'
import type { Harness } from './harness.ts'

export async function verifyDocuments(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('document.html'))
  await page.waitForFunction(() => document.querySelectorAll('#brochure iframe').length === 2 && document.querySelectorAll('#card iframe').length === 1)
  const facts = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll<HTMLElement>('#brochure .segnavia-document__sheet')]
    const card = document.querySelector<HTMLElement>('#card .segnavia-document__sheet')
    const cover = document.querySelector<HTMLElement>('#cover')
    return {
      sheets: sheets.map((sheet) => ({ width: sheet.getBoundingClientRect().width, height: sheet.getBoundingClientRect().height, page: sheet.dataset.page })),
      numbers: [...document.querySelectorAll('#brochure .segnavia-document__number')].map((number) => number.textContent?.trim()),
      card: card ? { width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height } : null,
      cover: cover
        ? {
            width: cover.getBoundingClientRect().width,
            height: cover.getBoundingClientRect().height,
            frames: cover.shadowRoot?.querySelectorAll('iframe').length,
          }
        : null,
      shadows: sheets.map((sheet) => getComputedStyle(sheet).boxShadow),
      sandboxes: [...document.querySelectorAll('#brochure iframe,#card iframe')].map((frame) => frame.getAttribute('sandbox')),
    }
  })
  const a4 = { width: 210 * PX_PER_MM, height: 297 * PX_PER_MM }
  check(
    'a document shows its pages in order on A4 sheets at no more than their natural 96 dpi size',
    facts.sheets.length === 2 &&
      facts.sheets.every(
        (sheet, index) => sheet.page === String(index) && sheet.width <= a4.width + 1 && Math.abs(sheet.width / sheet.height - 210 / 297) < 0.002,
      ) &&
      facts.numbers.join('|') === 'Page 1|Page 2',
    JSON.stringify(facts),
  )
  check(
    'small landscape paper and a page thumbnail keep the requested paper aspect ratios',
    Boolean(
      facts.card &&
        facts.cover &&
        Math.abs(facts.card.width / facts.card.height - 3.5 / 2) < 0.002 &&
        Math.abs(facts.cover.width / facts.cover.height - 210 / 297) < 0.002,
    ),
    JSON.stringify(facts),
  )
  check(
    'document sheets have visible edges and keep every page in a sandbox without same-origin access',
    facts.shadows.every((shadow) => shadow !== 'none') && facts.sandboxes.every((sandbox) => sandbox === 'allow-scripts'),
    JSON.stringify(facts),
  )

  const lazy = await page.evaluate(async () => {
    const viewer = document.createElement('segnavia-document') as HTMLElement & { load: (pages: unknown[], print: unknown) => void }
    viewer.style.inlineSize = '220px'
    document.body.append(viewer)
    viewer.load(
      Array.from({ length: 50 }, (_, index) => ({ html: `<p>Page ${index + 1}</p>` })),
      { paper: 'business-card-square-us', orientation: 'portrait' },
    )
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { sheets: viewer.querySelectorAll('.segnavia-document__sheet').length, frames: viewer.querySelectorAll('iframe').length }
  })
  check('a 50-page document creates every sheet but mounts only nearby frames', lazy.sheets === 50 && lazy.frames > 0 && lazy.frames < 50, JSON.stringify(lazy))
  await h.evidence('11-documents.png')
}
