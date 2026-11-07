import { DocumentCollection } from '@segnavia/format'
import { z } from 'zod'
import { BLOCK_ELEMENTS } from './block-context.ts'

export const DocumentAddress = z.union([z.object({ id: z.string().min(1) }), z.object({ name: z.string().min(1) })])
export type DocumentAddress = z.infer<typeof DocumentAddress>

export const CommandContentAddress = z.object({
  node: DocumentAddress,
  field: z.string().min(1),
  key: z.string().min(1).optional(),
})
export type CommandContentAddress = z.infer<typeof CommandContentAddress>

export const DocumentCommandLocation = z.union([
  z.object({ parent: DocumentAddress, index: z.number().int().nonnegative() }),
  z.object({ before: DocumentAddress }),
  z.object({ after: DocumentAddress }),
  z.object({ collection: DocumentCollection }),
])
export type DocumentCommandLocation = z.infer<typeof DocumentCommandLocation>

const CommandBlockPosition = z.union([
  z.object({ before: z.string().min(1) }),
  z.object({ after: z.string().min(1) }),
  z.object({ in: CommandContentAddress, at: z.enum(['start', 'end']) }),
])

const CommandSetBlockChange = z
  .object({
    kind: z.enum(BLOCK_ELEMENTS).optional(),
    html: z.string().optional(),
    text: z.string().optional(),
    class: z.string().nullable().optional(),
    attributes: z.record(z.string(), z.string().nullable()).optional(),
  })
  .refine((change) => change.html === undefined || change.text === undefined, 'setBlock cannot contain both html and text')

const SetContentCommand = z
  .object({ type: z.literal('setContent'), content: CommandContentAddress, html: z.string().optional(), value: z.unknown().optional() })
  .refine((command) => (command.html === undefined) !== (command.value === undefined), 'setContent requires exactly one of html or value')

export const DocumentCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), node: z.record(z.string(), z.unknown()), at: DocumentCommandLocation }),
  z.object({ type: z.literal('remove'), node: DocumentAddress }),
  z.object({ type: z.literal('move'), node: DocumentAddress, to: DocumentCommandLocation }),
  z.object({ type: z.literal('set'), node: DocumentAddress, fields: z.record(z.string(), z.unknown()) }),
  SetContentCommand,
  z.strictObject({ type: z.literal('setStyle'), fields: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('insertBlock'), html: z.string(), position: CommandBlockPosition }),
  z.object({ type: z.literal('setBlock'), block: z.string().min(1), change: CommandSetBlockChange }),
  z.object({ type: z.literal('moveBlock'), block: z.string().min(1), position: CommandBlockPosition }),
  z.object({ type: z.literal('removeBlock'), block: z.string().min(1) }),
])
export type DocumentCommand = z.infer<typeof DocumentCommand>

/** JSON Schema for commands accepted by editDocument. */
export function documentCommandJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DocumentCommand, { io: 'input' }) as Record<string, unknown>
}

export const DOCUMENT_COMMAND_BLOCK_KINDS = BLOCK_ELEMENTS
