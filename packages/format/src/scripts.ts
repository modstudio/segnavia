import { z } from 'zod'

// What an author's own scripts may do. `refuse` never runs them; `sandboxed`
// runs them in a frame with an opaque origin that cannot reach its host.
export const Scripts = z.enum(['refuse', 'sandboxed'])
export type Scripts = z.infer<typeof Scripts>
