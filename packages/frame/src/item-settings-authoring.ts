import type { Fill, SlotDeclaration, SlotValue } from '@segnavia/format'
import { cloneFill, cloneFills, isProvisionalFillId, sameFill } from './item-settings-fills.ts'
import type { ItemSettingsLabels } from './item-settings-labels.ts'
import { FillSaveQueue } from './item-settings-save.ts'

export interface ItemSettingsHandlers {
  createFill(input: { label: string }): Promise<Fill>
  saveFill(fill: Fill): Promise<void>
  deleteFill(id: string): Promise<void>
  pickAsset?: (slot: SlotDeclaration) => Promise<SlotValue | undefined>
}

export interface ItemSettingsErrorDetail {
  operation: 'createFill' | 'saveFill' | 'deleteFill'
  fillId: string | null
  message: string
  error: unknown
}

export interface ItemSettingsAuthoringHost {
  fills: Fill[]
  fill: string | null
  labels: ItemSettingsLabels
  emitSelect(id: string): void
  refresh(): void
  disconnectAuthoring(): void
}

interface PendingCreate {
  promise: Promise<Fill | null>
  deleted: boolean
  draft: Fill
}

export class ItemSettingsController extends EventTarget {
  private queue: FillSaveQueue
  private pending = new Map<string, PendingCreate>()
  private stopped = false

  constructor(
    private host: ItemSettingsAuthoringHost,
    private handlers: ItemSettingsHandlers,
  ) {
    super()
    this.queue = new FillSaveQueue(
      (fill) => this.handlers.saveFill(fill),
      (fill) => {
        this.host.fills = this.host.fills.map((item) => (item.id === fill.id ? cloneFill(fill) : item))
      },
      (id, error) => this.error('saveFill', id, error),
    )
    this.seedFills(host.fills)
  }

  seedFills(fills: readonly Fill[]) {
    for (const fill of fills) if (!isProvisionalFillId(fill.id)) this.queue.seed(fill)
  }

  get pickAsset(): ItemSettingsHandlers['pickAsset'] {
    return this.handlers.pickAsset
  }

  update(handlers: ItemSettingsHandlers) {
    this.handlers = handlers
    this.queue.setSave((fill) => this.handlers.saveFill(fill))
    this.host.refresh()
  }

  create(provisional: Fill) {
    const label = provisional.label ?? this.host.labels.newFill
    const pending: PendingCreate = { promise: Promise.resolve(null), deleted: false, draft: cloneFill(provisional) }
    pending.promise = this.handlers.createFill({ label }).then(
      (created) => this.created(provisional.id, created),
      (error: unknown) => this.createFailed(provisional.id, error),
    )
    this.pending.set(provisional.id, pending)
  }

  save(fill: Fill) {
    if (isProvisionalFillId(fill.id)) {
      const pending = this.pending.get(fill.id)
      if (pending) pending.draft = cloneFill(fill)
      return
    }
    this.queue.edit(fill)
  }

  delete(id: string, previousFills: readonly Fill[], previousSelected: string | null) {
    if (isProvisionalFillId(id)) {
      const pending = this.pending.get(id)
      if (!pending) return
      pending.deleted = true
      void pending.promise.then((created) => created && this.deleteHost(created.id, previousFills, previousSelected))
      return
    }
    void this.deleteHost(id, previousFills, previousSelected)
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending.values()].map((pending) => pending.promise))
    await this.queue.flushAll()
  }

  detach() {
    this.stopped = true
    this.queue.dispose()
    this.pending.clear()
    this.host.disconnectAuthoring()
  }

  private async created(tempId: string, created: Fill): Promise<Fill | null> {
    const pending = this.pending.get(tempId)
    this.pending.delete(tempId)
    if (this.stopped || !pending) return created
    if (pending.deleted) {
      const remaining = this.host.fills.filter((fill) => fill.id !== tempId)
      this.host.fills = remaining
      try {
        await this.handlers.deleteFill(created.id)
        this.queue.drop(created.id)
      } catch (error) {
        if (!this.stopped) {
          this.host.fills = [...remaining, cloneFill(created)]
          this.host.fill = created.id
          this.error('deleteFill', created.id, error)
        }
      }
      // This branch owns the host delete; returning null keeps the chained delete in delete() from repeating it.
      return null
    }
    const draft = pending.draft
    const merged = cloneFill(created)
    if (draft.label !== undefined) merged.label = draft.label
    merged.values = { ...draft.values }
    const selected = this.host.fill === tempId
    this.host.fills = this.host.fills.map((fill) => (fill.id === tempId ? merged : fill))
    this.queue.seed(created)
    if (selected) {
      this.host.fill = merged.id
      this.host.emitSelect(merged.id)
    }
    if (!sameFill(merged, created)) this.queue.edit(merged)
    return created
  }

  private createFailed(tempId: string, error: unknown): null {
    this.pending.delete(tempId)
    if (this.stopped) return null
    const remaining = this.host.fills.filter((fill) => fill.id !== tempId)
    const selected = this.host.fill === tempId
    this.host.fills = remaining
    if (selected) this.host.fill = remaining[0]?.id ?? null
    this.error('createFill', null, error)
    return null
  }

  private async deleteHost(id: string, previousFills: readonly Fill[], previousSelected: string | null) {
    try {
      await this.handlers.deleteFill(id)
      this.queue.drop(id)
    } catch (error) {
      if (this.stopped) return
      this.host.fills = cloneFills(previousFills)
      this.host.fill = previousSelected
      this.error('deleteFill', id, error)
    }
  }

  private error(operation: ItemSettingsErrorDetail['operation'], fillId: string | null, error: unknown) {
    const detail: ItemSettingsErrorDetail = {
      operation,
      fillId,
      message: error instanceof Error ? error.message : String(error),
      error,
    }
    this.dispatchEvent(new CustomEvent<ItemSettingsErrorDetail>('authoring-error', { detail }))
  }
}
