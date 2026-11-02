import { PAGE_WIDTHS, PageWidths, type PageWidths as PageWidthsValue } from '@segnavia/format'

export function parsePageWidths(value: PageWidthsValue | undefined): PageWidthsValue | undefined {
  return value === undefined ? undefined : PageWidths.parse(value)
}

export function samePageWidths(left: PageWidthsValue | undefined, right: PageWidthsValue | undefined): boolean {
  return (
    (left?.standard ?? PAGE_WIDTHS.standard) === (right?.standard ?? PAGE_WIDTHS.standard) &&
    (left?.wide ?? PAGE_WIDTHS.wide) === (right?.wide ?? PAGE_WIDTHS.wide)
  )
}
