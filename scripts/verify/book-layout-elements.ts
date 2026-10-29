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

function flowFacts() {
  const view = document.querySelector('[data-segnavia-flow-view]')
  const designed = view?.querySelector('[data-segnavia-flow-page-size]')
  const box = designed?.getBoundingClientRect()
  const column = view?.querySelector('[data-columns="2"]')
  const ids = Array.from(document.querySelectorAll('[id]'), (node) => node.id)
  return {
    heads: view?.querySelectorAll('[data-segnavia-head],[data-segnavia-foot]').length ?? -1,
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
    const frame = page.frameLocator(`#${id} iframe`)
    const html = frame.locator('html')
    await page.locator(`#${id}[data-segnavia-book-ready]`).waitFor()
    const pagesPlace = await frame.locator('[data-segnavia-pages]').evaluate(topPlace)

    await host.evaluate((element: HTMLElement & { layout: 'pages' | 'flow' }) => {
      element.style.inlineSize = '800px'
      element.layout = 'flow'
    })
    await frame.locator('[data-segnavia-flow-view]:visible').waitFor()
    const wide = await html.evaluate(flowFacts)
    const flowPlace = await frame.locator('[data-segnavia-flow-view]').evaluate(topPlace)
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
    const narrow = await html.evaluate(flowFacts)
    check(`${id} flow falls back to one column at a narrow frame`, narrow.columns === '1', JSON.stringify(narrow))

    await host.evaluate((element: HTMLElement) => {
      element.style.removeProperty('inline-size')
    })
    await page.waitForTimeout(50)
    await frame.locator('[data-segnavia-flow-view] [data-segnavia-position]').evaluateAll((blocks) => {
      const block = blocks[Math.floor(blocks.length / 2)]
      block?.scrollIntoView({ block: 'start' })
    })
    const selected = await frame.locator('[data-segnavia-flow-view]').evaluate(topPlace)
    await host.evaluate((element: HTMLElement & { layout: 'pages' | 'flow' }) => {
      element.layout = 'pages'
    })
    await frame.locator('[data-segnavia-pages]:visible').waitFor()
    const returned = await frame.locator('[data-segnavia-pages]').evaluate(topPlace)
    check(
      `${id} switches flow to pages with the selected block within one line of the top`,
      selected.key !== null && returned.key === selected.key && Math.abs(returned.top) <= returned.line,
      JSON.stringify({ selected, returned }),
    )
    if (language === 'he') {
      check(`${id} keeps its spread after switching layouts`, (await frame.locator('[data-segnavia-spread-blank]').count()) === 1)
    }

    const present = await html.evaluate(pageIdentity)
    await frame.locator('[data-segnavia-flow-view]').evaluate((element) => element.remove())
    const absent = await html.evaluate(pageIdentity)
    check(
      `${id} page count and first positions are unchanged with the flow view present or absent`,
      JSON.stringify(present) === JSON.stringify(absent),
      JSON.stringify({ present, absent }),
    )
  }
}
