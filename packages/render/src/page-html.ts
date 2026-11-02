import { Page, type PageInput } from '@segnavia/format'
import { bodyHtml } from '@segnavia/html'

export type HtmlPage = Page & { html: string }

export function resolvePageHtml(input: PageInput | Page | unknown): HtmlPage {
  const page = Page.parse(input)
  return { ...page, html: bodyHtml(page.body, { dir: page.dir, lang: page.lang }) }
}

export function asHtmlPage(page: Page | HtmlPage): HtmlPage {
  return 'html' in page ? page : { ...page, html: bodyHtml(page.body, { dir: page.dir, lang: page.lang }) }
}
