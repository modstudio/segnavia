import type { BoardItem } from '@segnavia/format'
import { checkResolved, type ResolvedBoardItem } from './board-policy.ts'

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>

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
