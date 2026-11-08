import { type BoardItem, type Document, pageOrPrintedFromDocument, resolveBrand } from '@segnavia/format'
import { classifyMediaAnswer, parseDocument, type ResolvePlacement } from '@segnavia/html'
import { type BoardBrandResolution, type CheckedResolvedBoardItem, checkResolvedWithBrand, type ResolvedAsset, type ResolvedBoardItem } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'

export type ResolveBoardItem = (item: BoardItem) => Promise<ResolvedBoardItem>

export function boardItemFrom(resolve: ResolvePlacement<ResolvedAsset>, signal?: AbortSignal): ResolveBoardItem {
  return async (item) => {
    const answer = await resolve(
      { kind: item.kind, address: item.address },
      { purpose: 'screen', width: Math.max(1, Math.round(item.width)), signal: signal ?? AbortSignal.any([]) },
    )
    if (!answer) throw new Error(`The ${item.kind} at ${item.address} could not be resolved.`)
    if (answer.kind === 'media') {
      const classified = classifyMediaAnswer({ answer })
      if (classified.status !== 'ok') throw new Error(`The media at ${item.address} could not be resolved for its board item.`)
      return { kind: 'image', src: classified.value.src, width: classified.value.media.size.width, height: classified.value.media.size.height }
    }
    if (answer.kind === 'page') {
      const document = parseDocument(answer.page)
      const size = pageOrPrintedFromDocument(document).size
      if (size.height === 'auto') throw new Error(`The page at ${item.address} has no fixed size for its board shape.`)
      return { kind: 'page', page: document, size }
    }
    return answer
  }
}

interface BoardResolutionEntry {
  kind: BoardItem['kind']
  value?: CheckedResolvedBoardItem
  failed?: boolean
}

export class BoardResolutions {
  resolver: ResolveBoardItem | undefined
  private brands: BrandsOptions | undefined
  private controller = new AbortController()
  private boardBrand: Promise<BoardBrandResolution> = Promise.resolve({ brand: undefined })
  private readonly entries = new Map<string, BoardResolutionEntry>()

  constructor(private readonly boardBrandFailed: (error: unknown) => void = () => {}) {}

  configure(document: Document | null, brands: BrandsOptions | undefined) {
    this.controller.abort()
    this.controller = new AbortController()
    this.brands = brands
    const controller = this.controller
    this.boardBrand = document
      ? resolveBrand(document, brands?.source, controller.signal).then(
          (brand): BoardBrandResolution => ({ brand }),
          (error): BoardBrandResolution => ({ error }),
        )
      : Promise.resolve({ brand: undefined })
    void this.boardBrand.then((result) => {
      if (controller === this.controller && 'error' in result) this.boardBrandFailed(result.error)
    })
    this.entries.clear()
  }

  keep(items: readonly BoardItem[]) {
    const kinds = new Map(items.map((item) => [item.address, item.kind]))
    for (const [address, entry] of this.entries) if (kinds.get(address) !== entry.kind) this.entries.delete(address)
  }

  value(address: string): CheckedResolvedBoardItem | undefined {
    const entry = this.entries.get(address)
    return entry?.failed ? undefined : entry?.value
  }

  request(item: BoardItem, resolved: (item: BoardItem, value: CheckedResolvedBoardItem) => void, failed: (item: BoardItem, error: unknown) => void) {
    if (!this.resolver || this.entries.has(item.address)) return
    const entry: BoardResolutionEntry = { kind: item.kind }
    this.entries.set(item.address, entry)
    Promise.resolve()
      .then(() => this.resolver?.(item) as Promise<ResolvedBoardItem>)
      .then(async (value) => {
        const checked = await checkResolvedWithBrand(item, value, this.boardBrand, this.brands?.source, this.controller.signal)
        entry.value = checked
        resolved(item, checked)
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
