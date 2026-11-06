import { z } from 'zod'

export const FolioTable = z.array(z.string())
/** One folio per page in page order; entry n is the folio for page n + 1. */
export type FolioTable = z.infer<typeof FolioTable>
