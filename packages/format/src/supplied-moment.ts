export function carryMoment<Key extends 'hostMoment' | 'moment'>(key: Key, moment: number | undefined): Partial<Record<Key, number>> {
  return moment === undefined ? {} : ({ [key]: moment } as Record<Key, number>)
}
