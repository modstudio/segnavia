import type { AsOfDay } from '@segnavia/format'
import { fillAsOfBindings } from './as-of-bindings.ts'
import { type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage } from './markdown.ts'

export function fillPageAsOfBindings<T extends HtmlPage | PrintedHtmlPage>(page: T, day: AsOfDay | undefined): T {
  if (!day) return page
  if (!isPrintedHtmlPage(page)) return { ...page, html: fillAsOfBindings(page.html, day) } as T
  return {
    ...page,
    printedPages: {
      ...page.printedPages,
      sections: page.printedPages.sections.map((section) => ({ ...section, html: fillAsOfBindings(section.html, day) })),
      parents: page.printedPages.parents.map((parent) => ({
        ...parent,
        regions: Object.fromEntries(Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: fillAsOfBindings(region.html, day) }])),
      })),
    },
  } as T
}
