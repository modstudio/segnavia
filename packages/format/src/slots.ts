import { z } from 'zod'

export const SLOT_TYPES = ['text', 'phone', 'email', 'link', 'qr', 'image'] as const
export const SlotType = z.enum(SLOT_TYPES)
export type SlotType = z.infer<typeof SlotType>

const SlotDeclarationShape = {
  key: z.string().regex(/^[^.\s]+(?:\.[^.\s]+)*$/, 'a slot key must be a dotted path'),
  label: z.string().min(1),
  type: SlotType,
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  overflow: z.enum(['shrink', 'truncate', 'wrap', 'refuse']).default('wrap'),
  minSize: z.number().positive().finite().optional(),
} as const

function validateOverflow(slot: { type: SlotType; overflow: 'shrink' | 'truncate' | 'wrap' | 'refuse'; minSize?: number }, ctx: z.RefinementCtx) {
  if ((slot.type === 'qr' || slot.type === 'image') && slot.overflow !== 'wrap') {
    ctx.addIssue({ code: 'custom', path: ['overflow'], message: `overflow cannot be declared for ${slot.type} slots` })
  }
  if (slot.type === 'qr' || slot.type === 'image') {
    if (slot.minSize !== undefined) ctx.addIssue({ code: 'custom', path: ['minSize'], message: `minSize cannot be declared for ${slot.type} slots` })
  } else if (slot.overflow !== 'shrink' && slot.minSize !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['minSize'], message: 'minSize can be declared only when overflow is shrink' })
  }
}

const withOverflowDefaults = <T extends { overflow: 'shrink' | 'truncate' | 'wrap' | 'refuse'; minSize?: number }>(slot: T) =>
  slot.overflow === 'shrink' ? { ...slot, minSize: slot.minSize ?? 6 } : slot

// Stored items are read tolerantly. SlotDeclarationInput is the strict write edge.
export const SlotDeclaration = z.object(SlotDeclarationShape).superRefine(validateOverflow).transform(withOverflowDefaults)
export type SlotDeclaration = Omit<z.infer<typeof SlotDeclaration>, 'overflow'> & { overflow?: z.infer<typeof SlotDeclaration>['overflow'] }
export const SlotDeclarationInput = z.strictObject(SlotDeclarationShape).superRefine(validateOverflow).transform(withOverflowDefaults)
export type SlotDeclarationInput = z.input<typeof SlotDeclarationInput>

export const Slots = z.array(SlotDeclaration).superRefine((slots, ctx) => {
  const seen = new Set<string>()
  slots.forEach((slot, index) => {
    if (seen.has(slot.key)) ctx.addIssue({ code: 'custom', path: [index, 'key'], message: `slot key "${slot.key}" is used twice` })
    seen.add(slot.key)
  })
})
export type Slots = z.infer<typeof Slots>

export const SlotsInput = z.array(SlotDeclarationInput).superRefine((slots, ctx) => {
  const seen = new Set<string>()
  slots.forEach((slot, index) => {
    if (seen.has(slot.key)) ctx.addIssue({ code: 'custom', path: [index, 'key'], message: `slot key "${slot.key}" is used twice` })
    seen.add(slot.key)
  })
})
export type SlotsInput = z.input<typeof SlotsInput>

export type SlotValue = string | { asset: string }

export interface Fill {
  id: string
  label?: string
  values: Record<string, SlotValue>
}

export interface SlotSource {
  id: string
  label: string
  fields: string[]
  list(options: { signal: AbortSignal }): Promise<Fill[]>
}

export type SlotState = 'filled' | 'placeholder' | 'unavailable' | 'invalid' | 'fit' | 'shrunk' | 'overflowed'

export interface SlotReport {
  fill: string | null
  slots: Record<string, SlotState>
  origins: Record<string, 'hand' | 'source'>
}

export interface SlotsOptions {
  /** The fill selected from a host data source; hand values override it per declared key. */
  source?: Fill
  fill?: Fill
  declarations?: SlotDeclarationInput[]
  /** Resolve an asset without network access. Hosts should honour the signal so timed-out renders stop this work promptly. */
  resolveAsset?: (ref: string, options: { signal: AbortSignal }) => Promise<string>
  report?: (report: SlotReport) => void
}

export function mergeSlotDeclarations(...groups: ReadonlyArray<readonly SlotDeclaration[]>): SlotDeclaration[] {
  const merged = new Map<string, SlotDeclaration>()
  for (const slot of groups.flat()) {
    const previous = merged.get(slot.key)
    if (!previous) {
      merged.set(slot.key, slot)
      continue
    }
    if (
      previous.type !== slot.type ||
      previous.required !== slot.required ||
      (previous.overflow ?? 'wrap') !== (slot.overflow ?? 'wrap') ||
      previous.minSize !== slot.minSize
    ) {
      throw new RangeError(
        `Slot "${slot.key}" has conflicting declarations: type ${previous.type}, required ${previous.required}, overflow ${previous.overflow ?? 'wrap'}; type ${slot.type}, required ${slot.required}, overflow ${slot.overflow ?? 'wrap'}.`,
      )
    }
  }
  return [...merged.values()]
}
