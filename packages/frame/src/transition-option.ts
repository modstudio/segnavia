import { DEFAULT_TRANSITION_DURATION_MS, MAX_TRANSITION_DURATION_MS, MIN_TRANSITION_DURATION_MS, Transition, type TransitionInput } from '@segnavia/format'

export interface AttributeTransition {
  kind?: Transition['kind']
  duration?: number
}

export function transitionFromAttributes(kindValue: string | null, durationValue: string | null): AttributeTransition | undefined {
  const kind = kindValue === 'none' || kindValue === 'fade' || kindValue === 'slide' ? kindValue : undefined
  const duration = durationValue !== null && /^\d+$/.test(durationValue) ? Number(durationValue) : undefined
  const boundedDuration = duration !== undefined && duration >= MIN_TRANSITION_DURATION_MS && duration <= MAX_TRANSITION_DURATION_MS ? duration : undefined
  return kind === undefined && boundedDuration === undefined ? undefined : { kind, duration: boundedDuration }
}

export function parseTransitionProperty(value: TransitionInput | 'none'): Transition | 'none' {
  if (value === 'none') return value
  const result = Transition.safeParse(value)
  if (result.success) return result.data
  const field = result.error.issues[0]?.path[0]
  if (field === 'duration') {
    throw new RangeError(
      `transition.duration must be an integer from ${MIN_TRANSITION_DURATION_MS} to ${MAX_TRANSITION_DURATION_MS} milliseconds; the default is ${DEFAULT_TRANSITION_DURATION_MS}`,
    )
  }
  throw new RangeError("transition.kind must be one of 'none', 'fade', or 'slide'")
}
