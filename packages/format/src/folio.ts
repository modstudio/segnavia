import { z } from 'zod'
import { formatNumber, NumberSystem, numberingScript } from './numbering.ts'

export const Numbering = z.object({
  system: NumberSystem,
  start: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  restart: z.boolean(),
  counted: z.boolean(),
  printed: z.boolean().default(true),
})
export type Numbering = z.infer<typeof Numbering>

export const SectionNumbering = z
  .strictObject(
    {
      counted: z.literal(false, { error: 'counted can only be false; remove counted to clear this refusal' }).optional(),
      restart: z
        .number()
        .int('restart must be a positive integer; set restart to a positive integer to clear this refusal')
        .positive('restart must be a positive integer; set restart to a positive integer to clear this refusal')
        .max(Number.MAX_SAFE_INTEGER, 'restart must be a positive integer; set restart to a positive safe integer to clear this refusal')
        .optional(),
    },
    { error: 'section numbering accepts only counted and restart; remove unknown numbering fields to clear this refusal' },
  )
  .superRefine((numbering, ctx) => {
    if (numbering.counted === false && numbering.restart !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['restart'],
        message: 'numbering cannot set counted: false together with restart; remove one of them to clear this refusal',
      })
    }
  })
export type SectionNumbering = z.infer<typeof SectionNumbering>

export interface NumberedPage {
  numbering: Numbering
}

export interface Folio {
  number: number
  text: string
  printed: boolean
}

export function computeFolios(pages: readonly NumberedPage[]): Array<Folio | null> {
  let next: number | undefined
  return pages.map(({ numbering }) => {
    if (next === undefined || numbering.restart) next = numbering.start
    if (!numbering.counted) return null
    const number = next
    next += 1
    return { number, text: formatNumber(number, numbering.system), printed: numbering.printed }
  })
}

export function sequenceFolios(count: number, system: NumberSystem, printed = true): Folio[] {
  return computeFolios(
    Array.from({ length: count }, () => ({
      numbering: { system, start: 1, restart: false, counted: true, printed },
    })),
  ).filter((folio): folio is Folio => folio !== null)
}

export function folioScript(): string {
  return `${numberingScript()}\n${computeFolios.toString()}\nvar computeFolios=${computeFolios.name};\n${sequenceFolios.toString()}\nvar sequenceFolios=${sequenceFolios.name};`
}
