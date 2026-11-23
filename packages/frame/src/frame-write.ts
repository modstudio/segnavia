export type ServedFrameKind = 'page' | 'book' | 'printed-page' | 'slide' | 'thumbnail'

export interface ServedFrameDocument {
  html: string
  policy: string
  kind: ServedFrameKind
}

export type ServeFrame = (document: ServedFrameDocument) => string | Promise<string>

const writes = new WeakMap<HTMLIFrameElement, number>()

export function frameDocumentPolicy(html: string): string {
  const match = html.match(/<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=(?:"([^"]*)"|'([^']*)')\s*>/i)
  if (!match) throw new Error('The frame document has no Content-Security-Policy meta element; build it with frameDocument to clear this refusal.')
  return (match[1] ?? match[2] ?? '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

function serveFrameRefusal(document: ServedFrameDocument, reason: unknown): Error {
  const detail = reason instanceof Error ? reason.message : String(reason)
  return new Error(
    `The host could not serve the ${document.kind} frame document because serveFrame rejected: ${detail}; make serveFrame resolve to an HTTP(S) URL to clear this refusal.`,
  )
}

export async function writeFrameDocument(iframe: HTMLIFrameElement, html: string, kind: ServedFrameKind, serve?: ServeFrame): Promise<boolean> {
  const write = (writes.get(iframe) ?? 0) + 1
  writes.set(iframe, write)
  if (!serve) {
    iframe.removeAttribute?.('src')
    iframe.srcdoc = html
    return true
  }
  const document = { html, policy: frameDocumentPolicy(html), kind }
  let value: string
  try {
    value = await serve(document)
  } catch (error) {
    if (writes.get(iframe) !== write) return false
    throw serveFrameRefusal(document, error)
  }
  if (writes.get(iframe) !== write) return false
  let url: URL
  try {
    url = new URL(value, iframe.ownerDocument.baseURI)
  } catch {
    throw serveFrameRefusal(document, `the returned value ${JSON.stringify(value)} is not a URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw serveFrameRefusal(document, `the returned URL uses the ${JSON.stringify(url.protocol)} protocol`)
  iframe.removeAttribute?.('srcdoc')
  iframe.src = url.href
  return true
}
