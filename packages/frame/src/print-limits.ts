import { type Limits, limitRefusal } from '@segnavia/format'

export function pagesSheetsRefusal(sheets: number, limits: Limits | undefined): string | undefined {
  const limit = limits?.sheets
  if (limit !== undefined && sheets > limit) return limitRefusal('sheets', sheets, limit)
}
