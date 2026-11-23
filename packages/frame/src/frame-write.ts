import type { BuiltFrameDocument } from './bridge.ts'

export type ServedFrameKind = 'page' | 'book' | 'printed-page' | 'slide' | 'thumbnail'

export interface ServedFrameDocument {
  html: string
  policy: string
  kind: ServedFrameKind
}

export type ServeFrame = (document: ServedFrameDocument) => string | Promise<string>

const writes = new WeakMap<HTMLIFrameElement, number>()

function rejectedServeFrame(document: ServedFrameDocument, reason: unknown): Error {
  const detail = reason instanceof Error ? reason.message : String(reason)
  return new Error(
    `The host could not serve the ${document.kind} frame document because serveFrame rejected: ${detail}; make serveFrame resolve to an HTTP(S) URL to clear this refusal.`,
  )
}

function unusableServeFrame(document: ServedFrameDocument, reason: string): Error {
  return new Error(
    `The host could not serve the ${document.kind} frame document because serveFrame returned an unusable URL: ${reason}; make serveFrame resolve to a nonempty HTTP(S) URL to clear this refusal.`,
  )
}

export async function writeFrameDocument(
  iframe: HTMLIFrameElement,
  built: BuiltFrameDocument,
  kind: ServedFrameKind,
  serve?: ServeFrame,
  onWritten?: () => void,
): Promise<boolean> {
  const write = (writes.get(iframe) ?? 0) + 1
  writes.set(iframe, write)
  if (!serve) {
    iframe.removeAttribute?.('src')
    iframe.srcdoc = built.html
    onWritten?.()
    return true
  }
  const document = { ...built, kind }
  let value: string
  try {
    value = await serve(document)
  } catch (error) {
    if (writes.get(iframe) !== write) return false
    throw rejectedServeFrame(document, error)
  }
  if (writes.get(iframe) !== write) return false
  if (value.trim() === '') throw unusableServeFrame(document, 'the returned value is empty')
  let url: URL
  try {
    url = new URL(value, iframe.ownerDocument.baseURI)
  } catch {
    throw unusableServeFrame(document, `the returned value ${JSON.stringify(value)} is not a URL`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw unusableServeFrame(document, `the returned URL uses the ${JSON.stringify(url.protocol)} protocol`)
  iframe.removeAttribute?.('srcdoc')
  iframe.src = url.href
  onWritten?.()
  return true
}
