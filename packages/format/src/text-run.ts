import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { Direction } from './direction.ts'

export const TextRun = closedObject({
  text: z.string().min(1, 'text run text cannot be empty; give the run text to clear this refusal'),
  lang: z.string().optional(),
  dir: Direction.optional(),
})
export type TextRun = z.infer<typeof TextRun>

const runText = (field: string) =>
  z.union([
    z.string().min(1, `${field} cannot be empty; omit ${field} or give it text to clear this refusal`),
    z.array(TextRun).min(1, `${field} cannot be an empty run list; omit ${field} or add a text run to clear this refusal`),
  ])

export const RunText = runText('text')
export type RunText = z.infer<typeof RunText>

export const runTextField = (field: string): ReturnType<typeof runText> => runText(field)

export function plainText(value: RunText): string {
  return typeof value === 'string' ? value : value.map((run) => run.text).join('')
}
