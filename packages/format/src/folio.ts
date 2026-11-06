import { z } from 'zod'
import { formatNumber, NumberSystem, numberingScript } from './numbering.ts'

export const Numbering = z.object({
  system: NumberSystem,
  start: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  restart: z.boolean(),
  counted: z.boolean(),
})
export type Numbering = z.infer<typeof Numbering>

export interface NumberedPage {
  numbering: Numbering
}

export interface Folio {
  number: number
  text: string
}

export function computeFolios(pages: readonly NumberedPage[]): Array<Folio | null> {
  let next: number | undefined
  return pages.map(({ numbering }) => {
    if (next === undefined || numbering.restart) next = numbering.start
    if (!numbering.counted) return null
    const number = next
    next += 1
    return { number, text: formatNumber(number, numbering.system) }
  })
}

export function sequenceFolios(count: number, system: NumberSystem): Folio[] {
  return computeFolios(
    Array.from({ length: count }, () => ({
      numbering: { system, start: 1, restart: false, counted: true },
    })),
  ).filter((folio): folio is Folio => folio !== null)
}

export function folioScript(): string {
  return `${numberingScript()}\n${computeFolios.toString()}\nvar computeFolios=${computeFolios.name};\n${sequenceFolios.toString()}\nvar sequenceFolios=${sequenceFolios.name};`
}
