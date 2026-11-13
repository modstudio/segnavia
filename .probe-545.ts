// Throwaway probe (outside the repository). Renders a printed Document whose
// body is an outer <table> (thead + one row: a label cell and a cell holding an
// inner <table> with thead + 40 rows) and records what the composed pages show.
import { chromium, type Page } from 'playwright-core'
import { chromiumPath } from './scripts/chromium-path.ts'
import { printedPageDocument } from './packages/frame/src/printed-page-document.ts'

const INNER_ROWS = Number(process.env.ROWS ?? 40)

function innerTable(): string {
  const rows = Array.from({ length: INNER_ROWS }, (_, i) => `<tr><td>INNER-ROW-${i + 1}</td></tr>`).join('')
  return `<table style="border-collapse:collapse;width:100%"><thead><tr><th>INNER-HEAD</th></tr></thead><tbody>${rows}</tbody></table>`
}

const pre = Array.from({ length: Number(process.env.PRE ?? 0) }, (_, i) => `<p style="margin:${process.env.PM ?? 16}px 0">Preceding paragraph ${i + 1}.</p>`).join("")
const flowHtml = pre + `<table style="border-collapse:collapse;width:100%"><thead><tr><th>OUTER-HEAD-LABEL</th><th>OUTER-HEAD-CELL</th></tr></thead><tbody><tr><td style="vertical-align:top">LABEL-CELL</td><td>${innerTable()}</td></tr></tbody></table>`

const margin = { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 }

const printedDoc = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'en' },
  print: { paper: 'letter' },
  parentPages: [{ type: 'parentPage', name: 'body', geometry: { margin } }],
  parentRules: [{ parent: 'body' }],
  children: [
    {
      type: 'section',
      id: 'body',
      title: 'Body',
      opens: 'any',
      children: [{ type: 'flow', html: `<div style="${process.env.WRAP ?? ""}font:16px/1.3 sans-serif">${flowHtml}</div>` }],
    },
  ],
}

const collect = `(() => {
  const pages = Array.from(document.querySelectorAll('[data-segnavia-printed-page]'))
  const sourceRows = Array.from(document.querySelectorAll('[data-segnavia-galley-source] tr')).map((r) => (r.textContent || '').trim())
  const out = { failure: document.documentElement.getAttribute('data-segnavia-compose-failure'), pages: [], sourceRows }
  for (const page of pages) {
    const paper = page.getBoundingClientRect()
    const windows = Array.from(page.querySelectorAll('[data-segnavia-window]'))
    const marker = { page: page.getAttribute('data-segnavia-printed-page'), folio: page.getAttribute('data-segnavia-folio'), paper: { top: paper.top, bottom: paper.bottom, height: paper.height }, windows: [], visible: [] }
    for (const win of windows) {
      const wr = win.getBoundingClientRect()
      marker.windows.push({ flow: win.getAttribute('data-flow'), start: win.getAttribute('data-start'), end: win.getAttribute('data-end'), top: win.getAttribute('data-top'), rect: { top: wr.top, bottom: wr.bottom, height: wr.height } })
      const cells = Array.from(win.querySelectorAll('td,th'))
      for (const cell of cells) {
        const t = (cell.textContent || '').trim()
        if (!t) continue
        const r = cell.getBoundingClientRect()
        const visibleInWindow = r.bottom > wr.top && r.top < wr.bottom && r.height > 0 && r.width > 0
        const insidePaper = r.bottom > paper.top && r.top < paper.bottom
        if (visibleInWindow && insidePaper) marker.visible.push(t)
      }
    }
    out.pages.push(marker)
  }
  // header-repeat views
  out.headerViews = Array.from(document.querySelectorAll('[data-segnavia-table-header]')).map((v) => ({ page: v.closest('[data-segnavia-printed-page]')?.getAttribute('data-segnavia-printed-page'), text: (v.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120), rect: (() => { const r = v.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height } })() }))
  return out
})()`

const browser = await chromium.launch({ executablePath: chromiumPath() })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page: Page = context.pages()[0] ?? (await context.newPage())
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message))

const html = printedPageDocument(printedDoc as never, { nonce: 'probe-nonce' })
console.log('document html length', html.length)
await page.setContent(html, { waitUntil: 'load' })
await page
  .waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20000 },
  )
  .catch((e) => console.log('wait failed:', String(e).slice(0, 200)))
const result = await page.evaluate(collect)
const geo = await page.evaluate(() => {
  const src = document.querySelector('[data-segnavia-galley-source]')
  if (!src) return 'no galley source'
  const o = src.getBoundingClientRect().top
  const first = src.firstElementChild ? src.firstElementChild.getBoundingClientRect().top - o : null
  const pick = (sel) => Array.from(src.querySelectorAll(sel)).map((e) => [(e.textContent||'').trim().slice(0,14), +(e.getBoundingClientRect().top - o).toFixed(1), +(e.getBoundingClientRect().bottom - o).toFixed(1)])
  const rows = pick('tr')
  return { srcTag: src.tagName, firstChildTop: first, firstP: pick('p').slice(0,1), table: pick('table').slice(0,1), headRow: rows[0], outerRow: rows[1], innerHead: rows[2], last: rows.at(-1) }
})
console.log('geo', JSON.stringify(geo))
console.log('placed', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('[data-segnavia-window]')).map((w) => ({ spacer: (w.querySelector('[data-segnavia-window-spacer]') as HTMLElement)?.style.paddingBlockStart, debug: w.querySelector('[data-segnavia-window-spacer]')?.getAttribute('data-debug'), clone: w.firstElementChild?.getBoundingClientRect(), block: w.querySelector('[data-segnavia-block]')?.getBoundingClientRect(), first: w.querySelector('p,th,td')?.getBoundingClientRect() })))))
console.log('selectors', JSON.stringify(await page.evaluate(() => ({ pages: document.querySelectorAll('[data-segnavia-pages] [data-segnavia-window]').length, sources: Array.from(document.querySelectorAll('[data-segnavia-galley-source] [data-segnavia-flow]')).map((e) => e.getAttribute('data-segnavia-flow')), windows: Array.from(document.querySelectorAll('[data-segnavia-window]')).map((e) => e.getAttribute('data-flow')) }))))
console.log('pageerrors:', errors)
console.log(JSON.stringify({ failure: result.failure, pages: result.pages.map((p) => ({ page: p.page, windows: p.windows.map((w) => [w.start, w.end]) })), headerViews: result.headerViews.map((h) => h.page) }))
await page.screenshot({ path: process.env.SHOT ?? '/private/tmp/claude-501/-Users-shmuel-Projects-segnavia/a87a32d9-5f66-4a02-8f26-d4790de15cfe/scratchpad/545-printed.png', fullPage: true })
const verdict = await page.evaluate(() => {
  const leaf = (root) => Array.from(root.querySelectorAll('p,td,th')).filter((e) => !e.querySelector('table'))
  const src = document.querySelector('[data-segnavia-galley-source]')
  const wanted = src ? leaf(src).map((e) => (e.textContent || '').trim()) : []
  const whole = new Set()
  for (const win of document.querySelectorAll('[data-segnavia-window],[data-segnavia-table-header]')) {
    const wr = win.getBoundingClientRect()
    for (const e of leaf(win)) {
      const r = e.getBoundingClientRect()
      if (r.top >= wr.top - 0.5 && r.bottom <= wr.bottom + 0.5) whole.add((e.textContent || '').trim())
    }
  }
  return wanted.filter((t) => !whole.has(t))
})
console.log('NOT SHOWN WHOLE ON ANY PAGE:', JSON.stringify(verdict))
await browser.close()
if (verdict.length > 0) process.exit(1)
