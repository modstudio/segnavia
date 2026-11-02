import { Page, type PageInput } from '@segnavia/format'
import { bodyHtml } from '@segnavia/html'

export type HtmlPage = Page & { html: string }

export function resolveParsedPageHtml(page: Page): HtmlPage {
  return { ...page, html: bodyHtml(page.body, { dir: page.dir, lang: page.lang }) }
}

export function resolvePageHtml(input: PageInput | unknown): HtmlPage {
  return resolveParsedPageHtml(Page.parse(input))
}

export function asHtmlPage(page: Page | HtmlPage): HtmlPage {
  return 'html' in page ? page : resolveParsedPageHtml(page)
}
