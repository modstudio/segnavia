import { safeMarkdownUrl } from '@segnavia/html'

export function validateMarkdownLink(href: string, linkOrigins: Iterable<string> | undefined) {
  if (safeMarkdownUrl('href', href, linkOrigins)) return
  const origins = linkOrigins === undefined ? '' : ', or an origin in linkOrigins'
  throw new Error(`Refused link href ${JSON.stringify(href)}; use an allowed scheme${origins} to clear this refusal.`)
}
