import { z } from 'zod'

export const MIN_TRANSITION_DURATION_MS = 0
export const MAX_TRANSITION_DURATION_MS = 2_000
export const DEFAULT_TRANSITION_DURATION_MS = 300

export const Transition = z.object({
  kind: z.enum(['none', 'fade', 'slide']),
  duration: z.number().int().min(MIN_TRANSITION_DURATION_MS).max(MAX_TRANSITION_DURATION_MS).default(DEFAULT_TRANSITION_DURATION_MS),
})
export type Transition = z.infer<typeof Transition>
export type TransitionInput = z.input<typeof Transition>
