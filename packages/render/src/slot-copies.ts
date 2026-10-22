import type { SlotsOptions } from '@segnavia/format'
import { collectSlotPrintCopies, type SlotPrintOptions } from '@segnavia/html'
import { joinPdfs } from './pdf-join.ts'

/** Renders one PDF per fill entry and joins them in entry order, so every copy counts against later sheet and byte limits. */
export async function renderSlotCopyPdfs(slots: SlotPrintOptions | undefined, renderCopy: (copy: SlotsOptions) => Promise<Uint8Array>): Promise<Uint8Array> {
  const copies = await collectSlotPrintCopies(slots, renderCopy)
  const first = copies[0]
  if (!first) throw new RangeError('Output was refused because slots.fills has no entries. Pass at least one fill, or omit fills, to clear this refusal.')
  if (copies.length === 1) return first
  return joinPdfs(copies)
}
