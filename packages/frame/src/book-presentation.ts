export const BOOK_LAYOUTS = ['pages', 'flow'] as const

export type BookLayout = (typeof BOOK_LAYOUTS)[number]

export interface VisibleBookBlock {
  key: string
  top: number
  bottom: number
}

export interface BookBlockTarget {
  key: string
  top: number
}

interface PositionKey {
  flow: string
  index: number
  footnotes: boolean
}

export function bookPositionKey(value: string): PositionKey | undefined {
  const match = /^(.*):(\d+)(:footnotes)?$/.exec(value)
  if (!match?.[1] || !match[2]) return undefined
  return { flow: match[1], index: Number(match[2]), footnotes: match[3] !== undefined }
}

export function bookPlace(blocks: VisibleBookBlock[]): string | undefined {
  return blocks.find((block) => block.bottom > 0)?.key
}

export function bookPlaceOffset(blocks: BookBlockTarget[], key: string): number {
  const exact = blocks.find((block) => block.key === key)
  if (exact) return exact.top

  const wanted = bookPositionKey(key)
  if (!wanted) return 0
  let sameFlow: BookBlockTarget | undefined
  const flowOrder: string[] = []
  for (const block of blocks) {
    const held = bookPositionKey(block.key)
    if (!held) continue
    if (!flowOrder.includes(held.flow)) flowOrder.push(held.flow)
    const preceding = held.index < wanted.index || (wanted.footnotes && held.index === wanted.index && !held.footnotes)
    if (held.flow === wanted.flow && preceding) sameFlow = block
  }
  if (sameFlow) return sameFlow.top

  const flowIndex = flowOrder.indexOf(wanted.flow)
  if (flowIndex < 1) return 0
  let earlier: BookBlockTarget | undefined
  for (const block of blocks) {
    const held = bookPositionKey(block.key)
    if (held && flowOrder.indexOf(held.flow) < flowIndex) earlier = block
  }
  return earlier?.top ?? 0
}

export function spreadSlots(pageCount: number): number {
  if (!Number.isSafeInteger(pageCount) || pageCount <= 0) return 0
  return pageCount + 1
}

export function pageScale(frameInline: number, paperInline: number, columns: number): number {
  if (![frameInline, paperInline, columns].every(Number.isFinite) || frameInline <= 0 || paperInline <= 0 || columns <= 0) return 0
  return Math.min(1, frameInline / (paperInline * columns))
}
