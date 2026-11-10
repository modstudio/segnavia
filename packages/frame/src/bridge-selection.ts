export interface PageSelection {
  text: string
  pageText: string
}

export type SelectionMessage = { selection: PageSelection } | { oversize: true }

export function selectionMessage(event: MessageEvent, frame: HTMLIFrameElement | null, id: number): SelectionMessage | null {
  if (event.source !== frame?.contentWindow) return null
  const data = event.data as { type?: unknown; id?: unknown; text?: unknown; pageText?: unknown }
  if (data?.type !== 'segnavia:selection' || data.id !== id || typeof data.text !== 'string' || typeof data.pageText !== 'string') return null
  if (data.text.length > 1_000_000 || data.pageText.length > 1_000_000) return { oversize: true }
  return { selection: { text: data.text, pageText: data.pageText } }
}

export function headingMessage(event: MessageEvent, frame: HTMLIFrameElement | null, id: number): number | null | undefined {
  if (event.source !== frame?.contentWindow) return undefined
  const data = event.data as { type?: unknown; id?: unknown; top?: unknown }
  if (data?.type !== 'segnavia:heading' || data.id !== id || (data.top !== null && (typeof data.top !== 'number' || !Number.isFinite(data.top))))
    return undefined
  return data.top
}
