import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { SlotKey } from './slots.ts'

export const RecordValues = z.record(SlotKey, z.string())
export type RecordValues = z.infer<typeof RecordValues>

export const RecordFacts = closedObject({ index: z.number().int().positive(), count: z.number().int().positive() })
export type RecordFacts = z.infer<typeof RecordFacts>
