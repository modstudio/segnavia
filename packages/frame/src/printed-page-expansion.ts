import type { FontReference } from '@segnavia/format'
import type { PrintedHtmlPage } from '@segnavia/html'
import type { ExpandedFramePage, ExpandedPrintedFramePage } from './motif-expansion.ts'

export function mergeExpandedPrintedPage(page: PrintedHtmlPage, expanded: ExpandedFramePage[]): ExpandedPrintedFramePage {
  const first = expanded[0]
  if (!first) throw new Error('a printed page needs at least one section')
  const { html: _html, ...fields } = first.page
  const fonts = new Map<string, FontReference>()
  for (const reference of expanded.flatMap((entry) => entry.fonts)) fonts.set(JSON.stringify(reference), reference)
  return {
    page: {
      ...fields,
      printedPages: {
        ...page.printedPages,
        ...first.page.printedPages,
        sections: page.printedPages.sections.map((section, index) => ({ ...section, html: expanded[index]?.page.html ?? section.html })),
      },
    },
    fonts: [...fonts.values()],
  }
}
