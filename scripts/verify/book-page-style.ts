export interface BookPageStyleFacts {
  image: { width: number; height: number } | null
  contents: { display: string; paddingInlineStart: string } | null
}

export function bookPageStyleComparisons(print: BookPageStyleFacts, screen: BookPageStyleFacts) {
  return [
    {
      name: 'page image box matches the print document',
      matches: print.image !== null && JSON.stringify(screen.image) === JSON.stringify(print.image),
      detail: { print: print.image, screen: screen.image },
    },
    {
      name: 'level-2 contents style matches the print document',
      matches: print.contents !== null && JSON.stringify(screen.contents) === JSON.stringify(print.contents),
      detail: { print: print.contents, screen: screen.contents },
    },
  ]
}

export function bookPageStyleFacts(): BookPageStyleFacts {
  const pages = document.querySelector('[data-segnavia-pages]')
  const transform = pages ? getComputedStyle(pages).transform : 'none'
  const scale = transform === 'none' ? 1 : Math.abs(new DOMMatrix(transform).a) || 1
  const image = pages?.querySelector('[data-segnavia-window] img,[data-segnavia-page-note] img')
  const box = image?.getBoundingClientRect()
  const contents = pages?.querySelector('.segnavia-contents-entry[data-level="2"]')
  const style = contents ? getComputedStyle(contents) : null
  const rounded = (value: number) => Math.round((value / scale) * 10) / 10
  return {
    image: box ? { width: rounded(box.width), height: rounded(box.height) } : null,
    contents: style ? { display: style.display, paddingInlineStart: style.paddingInlineStart } : null,
  }
}
