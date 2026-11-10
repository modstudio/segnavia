import type { CalendarDate } from './as-of.ts'
import { formatHebrewNumeral, isHebrew } from './numbering.ts'
import type { Variable } from './variable.ts'

export interface DateFormatRequest {
  date: CalendarDate
  calendar: 'gregorian' | 'hebrew'
  format: 'long' | 'short'
  lang?: string
}

export type DateFormatter = (request: DateFormatRequest) => string

export const HEBREW_MONTHS = {
  Tishri: 'תשרי',
  Heshvan: 'חשון',
  Kislev: 'כסלו',
  Tevet: 'טבת',
  Shevat: 'שבט',
  'Adar I': 'אדר א׳',
  'Adar II': 'אדר ב׳',
  Adar: 'אדר',
  Nisan: 'ניסן',
  Iyar: 'אייר',
  Sivan: 'סיון',
  Tamuz: 'תמוז',
  Av: 'אב',
  Elul: 'אלול',
} as const

export function libraryFormatDate(request: DateFormatRequest): string {
  const date = new Date(`${request.date}T00:00:00Z`)
  if (request.calendar !== 'hebrew' || !isHebrew(request.lang)) {
    return new Intl.DateTimeFormat(request.lang, {
      calendar: request.calendar === 'gregorian' ? 'gregory' : 'hebrew',
      dateStyle: request.format,
      timeZone: 'UTC',
    }).format(date)
  }
  const parts = new Intl.DateTimeFormat('en', {
    calendar: 'hebrew',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? ''
  const monthName = value('month')
  const month = HEBREW_MONTHS[monthName as keyof typeof HEBREW_MONTHS]
  if (!month) throw new Error(`Unknown Hebrew calendar month ${JSON.stringify(monthName)}; add its ICU spelling to the Hebrew month table.`)
  const day = formatHebrewNumeral(Number(value('day')))
  const year = formatHebrewNumeral(Number(value('year')), true)
  return request.format === 'long' ? `${day} ב${month} ${year}` : `${day} ${month} ${year}`
}

export function resolveDateVariables(
  variables: readonly Variable[],
  lang: string | undefined,
  formatDate: DateFormatter = libraryFormatDate,
): Record<string, string> {
  return Object.fromEntries(
    variables
      .filter((variable): variable is Extract<Variable, { kind: 'date' }> => variable.kind === 'date')
      .map((variable) => {
        let result: unknown
        try {
          result = formatDate({ date: variable.date, calendar: variable.calendar, format: variable.format, lang })
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          throw new Error(`Date variable ${JSON.stringify(variable.name)} could not be formatted: ${reason}; supply a working formatDate to clear this refusal.`)
        }
        if (typeof result !== 'string' || result.length > 256) {
          throw new Error(
            `Date variable ${JSON.stringify(variable.name)} formatDate result must be a string of at most 256 characters; return a valid string to clear this refusal.`,
          )
        }
        return [variable.name, result]
      }),
  )
}
