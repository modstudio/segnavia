import { NAMED_PAPERS, PX_PER_MM, sheetMm } from '@segnavia/format'
import type { Harness } from './harness.ts'

export async function verifyDocuments(h: Harness) {
  const { page, check } = h
  await page.goto(h.url('document.html'))
  await page.waitForFunction(
    () => document.querySelectorAll('#brochure iframe').length > 0 && document.querySelector('#cover')?.shadowRoot?.querySelector('iframe'),
  )
  const facts = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll<HTMLElement>('#brochure .segnavia-document__sheet')]
    const cover = document.querySelector<HTMLElement>('#cover')
    return {
      sheets: sheets.map((sheet) => ({ width: sheet.getBoundingClientRect().width, height: sheet.getBoundingClientRect().height, page: sheet.dataset.page })),
      numbers: [...document.querySelectorAll('#brochure .segnavia-document__number')].map((number) => number.textContent?.trim()),
      cover: cover
        ? {
            width: cover.getBoundingClientRect().width,
            height: cover.getBoundingClientRect().height,
            frames: cover.shadowRoot?.querySelectorAll('iframe').length,
          }
        : null,
      shadows: sheets.map((sheet) => getComputedStyle(sheet).boxShadow),
      sandboxes: [...document.querySelectorAll('#brochure iframe')].map((frame) => frame.getAttribute('sandbox')),
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
    'a page thumbnail keeps the requested paper aspect ratio',
    Boolean(facts.cover && Math.abs(facts.cover.width / facts.cover.height - 210 / 297) < 0.002),
    JSON.stringify(facts),
  )
  check(
    'document sheets have visible edges and keep every page in a sandbox without same-origin access',
    facts.shadows.every((shadow) => shadow !== 'none') && facts.sandboxes.every((sandbox) => sandbox === 'allow-scripts'),
    JSON.stringify(facts),
  )

  await page.locator('#card').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelectorAll('#card iframe').length === 1)
  const card = await page.locator('#card .segnavia-document__sheet').evaluate((sheet) => ({
    width: sheet.getBoundingClientRect().width,
    height: sheet.getBoundingClientRect().height,
    sandbox: sheet.querySelector('iframe')?.getAttribute('sandbox'),
  }))
  check(
    'a small landscape paper remains at its natural size and sandboxed',
    Math.abs(card.width / card.height - 3.5 / 2) < 0.002 && card.width <= 88.9 * PX_PER_MM + 1 && card.sandbox === 'allow-scripts',
    JSON.stringify(card),
  )

  const paperCases = [
    ...NAMED_PAPERS.map((paper) => ({ paper, orientation: 'portrait' as const })),
    { paper: { width: 90, height: 90, unit: 'mm' as const }, orientation: 'portrait' as const },
  ].map((print) => ({ print, sheet: sheetMm(print) }))
  const paperFacts = await page.evaluate((cases) => {
    const host = document.createElement('div')
    host.style.inlineSize = '240px'
    document.body.append(host)
    return cases.map(({ print, sheet }) => {
      const viewer = document.createElement('segnavia-document') as HTMLElement & { load: (pages: unknown[], print: unknown) => void }
      host.append(viewer)
      viewer.load([{ html: '<p>Paper</p>' }], print)
      const shown = viewer.querySelector<HTMLElement>('.segnavia-document__sheet')?.getBoundingClientRect()
      return { shown: shown ? { width: shown.width, height: shown.height } : null, sheet }
    })
  }, paperCases)
  check(
    'every named paper and a custom square sheet scale to fit without exceeding natural 96 dpi size',
    paperFacts.every(
      ({ shown, sheet }) =>
        shown !== null && Math.abs(shown.width / shown.height - sheet.width / sheet.height) < 0.002 && shown.width <= sheet.width * PX_PER_MM + 1,
    ),
    JSON.stringify(paperFacts),
  )

  const rtl = await page.locator('#brochure').evaluate((viewer) => {
    viewer.setAttribute('dir', 'rtl')
    const number = viewer.querySelector('.segnavia-document__number')
    return {
      direction: number ? getComputedStyle(number).direction : '',
      pages: [...viewer.querySelectorAll('[data-page]')].map((sheet) => sheet.getAttribute('data-page')),
    }
  })
  check(
    'a right-to-left document retains source page order and follows host direction',
    rtl.direction === 'rtl' && rtl.pages.join(',') === '0,1',
    JSON.stringify(rtl),
  )

  const lazy = await page.evaluate(async () => {
    const viewer = document.createElement('segnavia-document') as HTMLElement & { load: (pages: unknown[], print: unknown) => void }
    viewer.style.inlineSize = '220px'
    document.body.append(viewer)
    viewer.load(
      Array.from({ length: 50 }, (_, index) => ({ html: `<p>Page ${index + 1}</p>` })),
      { paper: 'business-card-square-us', orientation: 'portrait' },
    )
    viewer.scrollIntoView()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { sheets: viewer.querySelectorAll('.segnavia-document__sheet').length, frames: viewer.querySelectorAll('iframe').length }
  })
  check('a 50-page document creates every sheet but mounts only nearby frames', lazy.sheets === 50 && lazy.frames > 0 && lazy.frames < 50, JSON.stringify(lazy))
  await h.evidence('11-documents.png')
}
