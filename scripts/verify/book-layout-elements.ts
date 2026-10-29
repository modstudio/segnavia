import type { Locator, Page } from 'playwright-core'
import { LARGE_BOOK_WAIT_MS } from './book-stress-ready.ts'
import type { Harness } from './harness.ts'

interface PageIdentity {
  count: number
  first: Array<string | null>
}

function pageIdentity(): PageIdentity {
  const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
  return {
    count: pages.length,
    first: pages.map((page) => page.querySelector('[data-segnavia-position]')?.getAttribute('data-segnavia-position') ?? null),
  }
}

function topPlace(root: Element): { key: string | null; top: number; line: number } {
  for (const node of root.querySelectorAll('[data-segnavia-position]')) {
    const box = node.getBoundingClientRect()
    const clip = node.closest('[data-segnavia-window],[data-segnavia-book-page]')?.getBoundingClientRect() ?? box
    const bottom = Math.min(box.bottom, clip.bottom)
    if (bottom <= 0) continue
    const line = Number.parseFloat(getComputedStyle(node).lineHeight)
    return {
      key: node.getAttribute('data-segnavia-position'),
      top: Math.max(box.top, clip.top),
      line: Number.isFinite(line) ? line : 32,
    }
  }
  return { key: null, top: 0, line: 32 }
}

async function settledTopPlace(page: Page, html: Locator, key: string | null) {
  let place = await html.evaluate(topPlace)
  for (let attempt = 0; attempt < 20 && (place.key !== key || Math.abs(place.top) > place.line); attempt++) {
    await page.waitForTimeout(25)
    place = await html.evaluate(topPlace)
  }
  return place
}

async function settledBlockTop(page: Page, root: Locator, key: string | null, line: number) {
  let top: number | null = null
  for (let attempt = 0; attempt < 20; attempt++) {
    top = await root.evaluate((held, wanted) => {
      const block = Array.from(held.querySelectorAll('[data-segnavia-position]')).find((node) => node.getAttribute('data-segnavia-position') === wanted)
      return block?.getBoundingClientRect().top ?? null
    }, key)
    if (top !== null && Math.abs(top) <= line) return top
    await page.waitForTimeout(25)
  }
  return top
}

function flowFacts() {
  const designed = document.querySelector('[data-segnavia-flow-page-size]')
  const box = designed?.getBoundingClientRect()
  const column = document.querySelector('[data-columns="2"]')
  const ids = Array.from(document.querySelectorAll('[id]'), (node) => node.id)
  return {
    heads: document.querySelectorAll('[data-segnavia-head],[data-segnavia-foot]').length,
    designed: box ? { width: box.width, height: box.height } : null,
    columns: column ? getComputedStyle(column).columnCount : '',
    duplicateIds: ids.length - new Set(ids).size,
  }
}

export async function verifyBookLayoutSwitching(h: Harness) {
  const { page, check } = h
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    const host = page.locator(`#${id}`)
    const pagesFrame = page.frameLocator(`#${id} iframe[data-segnavia-book-layout="pages"]`)
    const pagesHtml = pagesFrame.locator('html')
    await page.locator(`#${id}[data-segnavia-book-ready]`).waitFor()
    const pagesPlace = await pagesHtml.evaluate(topPlace)
    const pageIdentityWithoutFlow = await pagesHtml.evaluate(pageIdentity)
    check(`${id} creates its flow frame lazily`, (await host.locator('iframe[data-segnavia-book-layout="flow"]').count()) === 0)

    await host.evaluate((element: HTMLElement & { layout: 'pages' | 'flow' }) => {
      element.style.inlineSize = '800px'
      element.layout = 'flow'
    })
    await host.locator('iframe[data-segnavia-book-layout="flow"]:visible').waitFor()
    const flowFrame = page.frameLocator(`#${id} iframe[data-segnavia-book-layout="flow"]`)
    const flowHtml = flowFrame.locator('html')
    const wide = await flowHtml.evaluate(flowFacts)
    const flowPlace = await settledTopPlace(page, flowHtml, pagesPlace.key)
    check(
      `${id} switches pages to flow at the same block`,
      pagesPlace.key !== null && flowPlace.key === pagesPlace.key && Math.abs(flowPlace.top) <= flowPlace.line,
      JSON.stringify({ pagesPlace, flowPlace }),
    )
    check(
      `${id} flow omits furniture, shows paper proportions and keeps ids unique`,
      wide.heads === 0 && wide.designed !== null && Math.abs(wide.designed.height / wide.designed.width - 210 / 148) < 0.02 && wide.duplicateIds === 0,
      JSON.stringify(wide),
    )
    check(`${id} flow uses two columns at a wide frame`, wide.columns === '2', JSON.stringify(wide))

    await host.evaluate((element: HTMLElement) => {
      element.style.inlineSize = '320px'
    })
    await page.waitForTimeout(50)
    const narrow = await flowHtml.evaluate(flowFacts)
    check(`${id} flow falls back to one column at a narrow frame`, narrow.columns === '1', JSON.stringify(narrow))

    await host.evaluate((element: HTMLElement) => {
      element.style.removeProperty('inline-size')
    })
    await page.waitForTimeout(50)
    await flowFrame.locator('[data-segnavia-position]').evaluateAll((blocks) => {
      const block = blocks[Math.floor(blocks.length / 2)]
      block?.scrollIntoView({ block: 'start' })
    })
    await page.waitForTimeout(100)
    const selected = await flowHtml.evaluate(topPlace)
    await host.evaluate((element: HTMLElement & { layout: 'pages' | 'flow' }) => {
      element.layout = 'pages'
    })
    await host.locator('iframe[data-segnavia-book-layout="pages"]:visible').waitFor()
    const returned = await pagesHtml.evaluate(topPlace)
    const selectedTop = await settledBlockTop(page, pagesFrame.locator('[data-segnavia-pages]'), selected.key, selected.line)
    check(
      `${id} switches flow to pages with the selected block within one line of the top`,
      selected.key !== null && selectedTop !== null && Math.abs(selectedTop) <= selected.line,
      JSON.stringify({ selected, selectedTop, returned }),
    )
    if (language === 'he') {
      check(`${id} keeps its spread after switching layouts`, (await pagesFrame.locator('[data-segnavia-spread-blank]').count()) === 1)
    }

    const pageIdentityWithFlow = await pagesHtml.evaluate(pageIdentity)
    check(
      `${id} page count and first positions are unchanged after the flow frame is present`,
      JSON.stringify(pageIdentityWithFlow) === JSON.stringify(pageIdentityWithoutFlow),
      JSON.stringify({ before: pageIdentityWithoutFlow, after: pageIdentityWithFlow }),
    )
  }
}

export async function verifyNonceAuthorizedAuthorScripts(h: Harness) {
  for (const language of ['en', 'he'] as const) {
    const id = `book-screen-${language}`
    await h.page.locator(`#${id} iframe[data-segnavia-book-layout="pages"]`).evaluate((frame: HTMLIFrameElement) => {
      const nonce = frame.srcdoc.match(/<script nonce="([^"]+)"/)?.[1]
      if (!nonce) throw new Error(`${frame.title} has no bridge nonce.`)
      frame.srcdoc = frame.srcdoc.replace('<script data-segnavia-author-script>', `<script data-segnavia-author-script nonce="${nonce}">`)
    })
    const frame = h.page.frameLocator(`#${id} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('html[data-segnavia-author-script-ran]').waitFor({ timeout: LARGE_BOOK_WAIT_MS, state: 'attached' })
    const composed = await frame.locator('html').getAttribute('data-segnavia-composed')
    h.check(`${id} author-script refusal check detects a nonce-authorized mutation`, composed !== null, String(composed))
  }
}
