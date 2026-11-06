import { z } from 'zod'

/** One folio per page in page order; entry n is the folio for page n + 1. */
export const FolioTable = z.array(z.string())
export type FolioTable = z.infer<typeof FolioTable>
