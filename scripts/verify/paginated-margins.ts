export interface PaginatedMarginReport {
  spine: { page: number; distance: number; expected: number; side: string }[]
  text: { checked: number; outside: number; detail: string }
  furniture: { matches: boolean; checked: number }
}

export function inspectPaginatedMargins(): PaginatedMarginReport {
  const parents = JSON.parse(document.documentElement.getAttribute('data-segnavia-parent-margins') ?? '[]') as Array<{
    name: string
    margin: { top: number; bottom: number; inner: number; outer: number }
  }>
  const margins = new Map(parents.map((parent) => [parent.name, parent.margin]))
  const pages = Array.from(document.querySelectorAll('[data-segnavia-book-page]'))
  const rightHand = (index: number) => (index % 2 === 1) === (document.documentElement.getAttribute('dir') !== 'rtl')
  const spine = pages.map((page) => {
    const index = Number(page.getAttribute('data-segnavia-book-page'))
    const text = page.querySelector('[data-segnavia-text]')
    const margin = margins.get(page.getAttribute('data-segnavia-parent') ?? '')
    if (!text || !margin) return { page: index, distance: Number.NaN, expected: Number.NaN, side: 'missing' }
    const paperBox = page.getBoundingClientRect()
    const textBox = text.getBoundingClientRect()
    return {
      page: index,
      distance: rightHand(index) ? textBox.left - paperBox.left : paperBox.right - textBox.right,
      expected: margin.inner,
      side: rightHand(index) ? 'right' : 'left',
    }
  })
  const details: string[] = []
  let checked = 0
  let outside = 0
  for (const page of pages) {
    const index = Number(page.getAttribute('data-segnavia-book-page'))
    const margin = margins.get(page.getAttribute('data-segnavia-parent') ?? '')
    const text = page.querySelector('[data-segnavia-text]')
    if (!margin || !text) continue
    checked += 1
    const paperBox = page.getBoundingClientRect()
    const textBox = text.getBoundingClientRect()
    const start = rightHand(index) ? textBox.left - paperBox.left : paperBox.right - textBox.right
    const end = rightHand(index) ? paperBox.right - textBox.right : textBox.left - paperBox.left
    const top = textBox.top - paperBox.top
    const bottom = paperBox.bottom - textBox.bottom
    const fits =
      Math.abs(start - margin.inner) < 0.5 && Math.abs(end - margin.outer) < 0.5 && Math.abs(top - margin.top) < 0.5 && Math.abs(bottom - margin.bottom) < 0.5
    if (!fits) outside += 1
    details.push(`${index}:${start.toFixed(2)}/${end.toFixed(2)}/${top.toFixed(2)}/${bottom.toFixed(2)}`)
  }
  const strips = pages.flatMap((page) => Array.from(page.querySelectorAll('[data-segnavia-head], [data-segnavia-foot]')))
  const matches = strips.every((strip) => {
    const text = strip.closest('[data-segnavia-book-page]')?.querySelector('[data-segnavia-text]')
    return Boolean(text && Math.abs(strip.getBoundingClientRect().width - text.getBoundingClientRect().width) < 0.5)
  })
  return { spine, text: { checked, outside, detail: details.join('|') }, furniture: { matches, checked: strips.length } }
}
