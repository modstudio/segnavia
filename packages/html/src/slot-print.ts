import type { Fill, SlotReport, SlotsOptions } from '@segnavia/format'
import { RequiredSlotsRefusedError, UnmeasuredSlotsRefusedError } from './slot-policy.ts'
import { SlotFillRefusedError } from './slots.ts'

/** One copy of a print/PDF item: that copy's hand layer over its source layer. */
export interface SlotFillEntry {
  fill?: Fill
  source?: Fill
}

export interface SlotPrintOptions extends SlotsOptions {
  fills?: SlotFillEntry[]
  /** When set, copies that would be refused are reported and omitted; the job still refuses if none remain. */
  skipRefused?: boolean
}

export class SlotFillsConflictError extends Error {
  constructor() {
    super('slots.fills cannot be given together with slots.fill or slots.source. Pass only fills, or only fill and source, to clear this refusal.')
    this.name = 'SlotFillsConflictError'
  }
}

export interface SlotFillRefusal {
  index: number
  id: string
  slots: ReadonlyArray<{ key: string; state: string }>
  error: Error
}

export class SlotFillsRefusedError extends Error {
  readonly entries: readonly SlotFillRefusal[]

  constructor(entries: readonly SlotFillRefusal[]) {
    super(slotFillsRefusedMessage(entries))
    this.name = 'SlotFillsRefusedError'
    this.entries = entries
  }
}

export function slotFillCopyId(entry: SlotFillEntry, index: number): string {
  return entry.fill?.id ?? String(index)
}

export function slotFillsConflict(options: SlotPrintOptions | undefined): SlotFillsConflictError | undefined {
  return options?.fills && (options.fill || options.source) ? new SlotFillsConflictError() : undefined
}

export function assertSlotPrintOptions(options: SlotPrintOptions | undefined): void {
  const conflict = slotFillsConflict(options)
  if (conflict) throw conflict
}

/** Single-copy fill paths refuse `fills`; print and PDF jobs loop it themselves. */
export function assertSingleSlotCopy(options: SlotsOptions | undefined): void {
  const print = options as SlotPrintOptions | undefined
  assertSlotPrintOptions(print)
  if (print?.fills) {
    throw new RangeError('slots.fills prints one copy per entry in a PDF or print document. Pass fill or source for a single copy, to clear this refusal.')
  }
}

export function isSlotCopyRefusal(error: unknown): error is Error {
  return error instanceof RequiredSlotsRefusedError || error instanceof UnmeasuredSlotsRefusedError || error instanceof SlotFillRefusedError
}

function copySlots(options: SlotPrintOptions, entry: SlotFillEntry, capture: ((report: SlotReport) => void) | undefined): SlotsOptions {
  return {
    declarations: options.declarations,
    resolveAsset: options.resolveAsset,
    fill: entry.fill,
    source: entry.source,
    report: capture,
  }
}

function emptyReport(entry: SlotFillEntry): SlotReport {
  return { fill: entry.fill?.id ?? entry.source?.id ?? null, slots: {}, origins: {} }
}

function refusalFrom(error: Error, entry: SlotFillEntry, index: number): SlotFillRefusal {
  const id = slotFillCopyId(entry, index)
  if (error instanceof RequiredSlotsRefusedError) return { index, id, slots: error.slots, error }
  if (error instanceof UnmeasuredSlotsRefusedError) {
    return { index, id, slots: error.keys.map((key) => ({ key, state: 'unmeasured' })), error }
  }
  return { index, id, slots: [], error }
}

function entryLabel(entry: SlotFillRefusal): string {
  return entry.id === String(entry.index) ? entry.id : `"${entry.id}"`
}

function describeRefusal(entry: SlotFillRefusal): string {
  if (entry.error instanceof SlotFillRefusedError) return `${entryLabel(entry)} (scripts: '${entry.error.scripts}')`
  if (entry.slots.length === 0) return entryLabel(entry)
  return `${entryLabel(entry)} ${entry.slots.map(({ key, state }) => `"${key}" (${state})`).join(', ')}`
}

function clearsFor(entries: readonly SlotFillRefusal[]): string {
  let required = false
  let unmeasured = false
  let scripts = false
  for (const entry of entries) {
    if (entry.error instanceof RequiredSlotsRefusedError) required = true
    else if (entry.error instanceof UnmeasuredSlotsRefusedError) unmeasured = true
    else if (entry.error instanceof SlotFillRefusedError) scripts = true
  }
  const parts = [
    required ? "Fill required slots; for an overflowed refuse slot, shorten its value or change the slot's overflow." : '',
    unmeasured ? "Ensure each filled slot frame becomes ready before the output deadline, or change the slot's overflow from 'refuse'." : '',
    scripts ? "Set the item's scripts to 'refuse', or show it without a fill." : '',
  ].filter(Boolean)
  return parts.join(' ')
}

function slotFillsRefusedMessage(entries: readonly SlotFillRefusal[]): string {
  if (entries.length === 0) {
    return 'Output was refused because slots.fills has no entries. Pass at least one fill, or omit fills, to clear this refusal.'
  }
  return `Output was refused because fills prevent printing: ${entries.map(describeRefusal).join('; ')}. ${clearsFor(entries)}`
}

async function renderOneCopy<T>(
  options: SlotPrintOptions,
  entry: SlotFillEntry,
  index: number,
  renderCopy: (copy: SlotsOptions) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; refusal: SlotFillRefusal }> {
  let lastReport: SlotReport | undefined
  const capture = options.report
    ? (report: SlotReport) => {
        lastReport = report
      }
    : undefined
  try {
    const value = await renderCopy(copySlots(options, entry, capture))
    options.report?.(lastReport ?? emptyReport(entry))
    return { ok: true, value }
  } catch (error) {
    if (!isSlotCopyRefusal(error)) throw error
    options.report?.(lastReport ?? emptyReport(entry))
    return { ok: false, refusal: refusalFrom(error, entry, index) }
  }
}

/**
 * Runs one print/PDF copy per `fills` entry, in order. Without `fills`, runs once with the given options.
 * Host `report` is called once per entry, in entry order, including refused copies.
 */
export async function collectSlotPrintCopies<T>(options: SlotPrintOptions | undefined, renderCopy: (copy: SlotsOptions) => Promise<T>): Promise<T[]> {
  assertSlotPrintOptions(options)
  if (!options?.fills) return [await renderCopy(options ?? {})]
  if (options.fills.length === 0) throw new SlotFillsRefusedError([])
  const kept: T[] = []
  const refused: SlotFillRefusal[] = []
  for (const [index, entry] of options.fills.entries()) {
    const outcome = await renderOneCopy(options, entry, index, renderCopy)
    if (outcome.ok) kept.push(outcome.value)
    else refused.push(outcome.refusal)
  }
  if (refused.length > 0 && (!options.skipRefused || kept.length === 0)) throw new SlotFillsRefusedError(refused)
  return kept
}
