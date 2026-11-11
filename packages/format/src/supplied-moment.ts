import type { AsOfDay } from './as-of.ts'

export function carryMoment<Key extends 'hostMoment' | 'moment'>(key: Key, moment: number | undefined): Partial<Record<Key, number>> {
  return moment === undefined ? {} : ({ [key]: moment } as Record<Key, number>)
}

/** A fixed day is a date the author chose, so it never carries the host's moment; any other resolved day carries it when supplied. */
export function dayWithHostMoment(day: AsOfDay, hostMoment: number | undefined): AsOfDay {
  return day.kind === 'fixed' ? day : { ...day, ...carryMoment('moment', hostMoment) }
}
