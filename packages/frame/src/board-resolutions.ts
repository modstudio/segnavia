import type { BoardItem } from '@segnavia/format'
import type { ResolvePlacement } from '@segnavia/html'
import { checkResolved, type ResolvedAsset, type ResolvedBoardItem } from './board-policy.ts'

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>

export function boardItemFrom(resolve: ResolvePlacement<ResolvedAsset>): ResolveBoardItem {
  return async (item) => {
    const answer = await resolve(
      { kind: item.kind, address: item.address },
      { purpose: 'screen', width: Math.max(1, Math.round(item.width)), signal: new AbortController().signal },
    )
    if (!answer) throw new Error(`The ${item.kind} at ${item.address} could not be resolved.`)
    if (answer.kind === 'media') return { kind: 'image', src: answer.src, width: answer.media.size.width, height: answer.media.size.height }
    if (answer.kind === 'page') {
      const size = answer.page.size
      if (typeof size === 'string' || size.height === 'auto') throw new Error(`The page at ${item.address} has no fixed size for its board shape.`)
      return { kind: 'page', page: answer.page, size }
    }
    return answer
  }
}

interface BoardResolutionEntry {
  value?: ResolvedBoardItem
  failed?: boolean
}

export class BoardResolutions {
  resolver: ResolveBoardItem | undefined
  private readonly entries = new Map<string, BoardResolutionEntry>()

  keep(addresses: ReadonlySet<string>) {
    for (const address of this.entries.keys()) if (!addresses.has(address)) this.entries.delete(address)
  }

  value(address: string): ResolvedBoardItem | undefined {
    const entry = this.entries.get(address)
    return entry?.failed ? undefined : entry?.value
  }

  request(item: BoardItem, resolved: (item: BoardItem, value: ResolvedBoardItem) => void, failed: (item: BoardItem, error: unknown) => void) {
    if (!this.resolver || this.entries.has(item.address)) return
    const entry: BoardResolutionEntry = {}
    this.entries.set(item.address, entry)
    Promise.resolve()
      .then(() => this.resolver?.(item) as Promise<ResolvedBoardItem>)
      .then((value) => {
        checkResolved(item, value)
        entry.value = value
        resolved(item, value)
      })
      .catch((error) => failed(item, error))
  }

  fail(item: BoardItem): boolean {
    const entry = this.entries.get(item.address)
    if (!entry || entry.failed) return false
    entry.failed = true
    return true
  }
}
