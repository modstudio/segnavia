import { z } from 'zod'

export const FolioTable = z.array(z.string())
export type FolioTable = z.infer<typeof FolioTable>
