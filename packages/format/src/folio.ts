import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { formatNumber, NumberSystem, numberingScript } from './numbering.ts'

export const Numbering = closedObject({
  system: NumberSystem,
  start: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  restart: z.boolean(),
  counted: z.boolean(),
  printed: z.boolean().default(true),
})
export type Numbering = z.infer<typeof Numbering>

export const NumberingRestart = z
  .number()
  .int('restart must be a positive integer; set restart to a positive integer to clear this refusal')
  .positive('restart must be a positive integer; set restart to a positive integer to clear this refusal')
  .max(Number.MAX_SAFE_INTEGER, 'restart must be a positive integer; set restart to a positive safe integer to clear this refusal')

export const SectionNumbering = z
  .strictObject(
    {
      counted: z.literal(false, { error: 'counted can only be false; remove counted to clear this refusal' }).optional(),
      restart: NumberingRestart.optional(),
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

export interface NumberingRuns {
  folios: Array<Folio | null>
  runIndexes: number[]
  totals: string[]
}

export function computeNumberingRuns(pages: readonly NumberedPage[]): NumberingRuns {
  let next = 0
  let runIndex = -1
  const runIndexes: number[] = []
  const totals: string[] = []
  const folios = pages.map(({ numbering }, pageIndex) => {
    const startsRun = pageIndex === 0 || numbering.restart
    if (startsRun) next = numbering.start
    if (startsRun) {
      runIndex += 1
      totals.push('')
    }
    runIndexes.push(runIndex)
    if (!numbering.counted) return null
    const number = next
    next += 1
    const text = formatNumber(number, numbering.system)
    totals[runIndex] = text
    return { number, text, printed: numbering.printed }
  })
  return { folios, runIndexes, totals }
}

export function computeFolios(pages: readonly NumberedPage[]): Array<Folio | null> {
  return computeNumberingRuns(pages).folios
}

export function sequenceFolios(count: number, system: NumberSystem, printed = true): Folio[] {
  return computeNumberingRuns(
    Array.from({ length: count }, () => ({
      numbering: { system, start: 1, restart: false, counted: true, printed },
    })),
  ).folios.filter((folio): folio is Folio => folio !== null)
}

export function folioScript(): string {
  return `${numberingScript()}\n${computeNumberingRuns.toString()}\nvar computeNumberingRuns=${computeNumberingRuns.name};\n${computeFolios.toString()}\nvar computeFolios=${computeFolios.name};\n${sequenceFolios.toString()}\nvar sequenceFolios=${sequenceFolios.name};`
}
