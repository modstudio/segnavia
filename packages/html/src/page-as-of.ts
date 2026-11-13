import type { AsOfDay } from '@segnavia/format'
import { fillAsOfBindings } from './as-of-bindings.ts'
import { type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage } from './markdown.ts'
import { printedSectionBodies, withPrintedSectionBodies } from './printed-section-flows.ts'
import { fillParentRegions } from './record-as-of.ts'

export function fillPageAsOfBindings<T extends HtmlPage | PrintedHtmlPage>(page: T, day: AsOfDay | undefined): T {
  if (!day) return page
  if (!isPrintedHtmlPage(page)) return { ...page, html: fillAsOfBindings(page.html, day) } as T
  return {
    ...page,
    printedPages: {
      ...page.printedPages,
      sections: page.printedPages.sections.map((section) =>
        withPrintedSectionBodies(
          section,
          printedSectionBodies(section).map((html) => fillAsOfBindings(html, day)),
        ),
      ),
      parents: page.printedPages.parents.map((parent) => ({
        ...parent,
        regions: fillParentRegions(parent.regions, day),
      })),
    },
  } as T
}
