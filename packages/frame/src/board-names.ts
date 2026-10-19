import type { BoardItem } from '@segnavia/format'
import type { ResolvedBoardItem } from './board-policy.ts'

export type BoardItemNames = (items: BoardItem[]) => Promise<Record<string, string>>

export class BoardNames {
  private readonly names = new Map<string, string>()
  private readonly inFlight = new Set<string>()
  private readonly failedAddresses = new Set<string>()
  private activeAddresses = new Set<string>()
  private provider: BoardItemNames | undefined
  private generation = 0

  constructor(
    private readonly changed: () => void,
    private readonly failed: (items: BoardItem[], error: unknown) => void,
  ) {}

  update(items: BoardItem[], provider: BoardItemNames | undefined) {
    if (provider !== this.provider) {
      const hadNames = this.names.size > 0
      this.provider = provider
      this.generation += 1
      this.names.clear()
      this.inFlight.clear()
      this.failedAddresses.clear()
      if (hadNames) this.changed()
    }
    const addresses = new Set(items.map((item) => item.address))
    this.activeAddresses = addresses
    for (const address of this.names.keys()) if (!addresses.has(address)) this.names.delete(address)
    if (!provider) return
    const batch = items.filter((item) => !this.names.has(item.address) && !this.inFlight.has(item.address) && !this.failedAddresses.has(item.address))
    if (batch.length === 0) return
    const generation = this.generation
    for (const item of batch) this.inFlight.add(item.address)
    Promise.resolve()
      .then(() => provider(batch))
      .then((result) => {
        if (generation !== this.generation) return
        for (const item of batch) this.inFlight.delete(item.address)
        const ids = new Map(batch.map((item) => [item.id, item]))
        for (const [id, name] of Object.entries(result)) {
          const item = ids.get(id)
          if (item && this.activeAddresses.has(item.address) && typeof name === 'string' && name.length > 0) this.names.set(item.address, name)
        }
        this.changed()
      })
      .catch((error) => {
        if (generation !== this.generation) return
        for (const item of batch) {
          this.inFlight.delete(item.address)
          this.failedAddresses.add(item.address)
        }
        this.failed(batch, error)
      })
  }

  name(item: BoardItem | undefined, resolved: ResolvedBoardItem | undefined): string {
    return (item && this.names.get(item.address)) || resolved?.title || ''
  }
}
