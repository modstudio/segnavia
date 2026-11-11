import type { HtmlPage } from '@segnavia/html'

export function documentSheets(pages: readonly HtmlPage[], width: number, list: HTMLElement): HTMLElement[] {
  return pages.map((_, index) => {
    const item = document.createElement('div')
    item.className = 'segnavia-document__item'
    item.dataset.pageIndex = String(index)
    const sheet = document.createElement('div')
    sheet.className = 'segnavia-document__sheet'
    sheet.dataset.page = String(index)
    sheet.style.width = `${width}px`
    const number = document.createElement('div')
    number.className = 'segnavia-document__number'
    number.innerHTML = `Page <bdi dir="ltr">${index + 1}</bdi>`
    item.append(sheet, number)
    list.append(item)
    return sheet
  })
}
