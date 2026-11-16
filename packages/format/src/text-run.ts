import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { Direction } from './direction.ts'

const textRun = (field: string) =>
  closedObject({
    text: z.string().min(1, `${field} run text cannot be empty; give ${field} text to clear this refusal`),
    lang: z.string().optional(),
    dir: Direction.optional(),
  })

export const TextRun = textRun('text')
export type TextRun = z.infer<typeof TextRun>

interface RunTextFieldOptions {
  emptyString: 'allowed' | 'refused'
}

export const runTextField = (field: string, options: RunTextFieldOptions) =>
  z.union([
    options.emptyString === 'allowed' ? z.string() : z.string().min(1, `${field} cannot be empty; omit ${field} or give it text to clear this refusal`),
    z.array(textRun(field)).min(1, `${field} cannot be an empty run list; omit ${field} or add a text run to clear this refusal`),
  ])

export const RunText = runTextField('text', { emptyString: 'allowed' })
export type RunText = z.infer<typeof RunText>

export function plainText(value: RunText): string
export function plainText(value: RunText | undefined): string | undefined
export function plainText(value: RunText | undefined): string | undefined {
  return typeof value === 'string' || value === undefined ? value : value.map((run) => run.text).join('')
}
