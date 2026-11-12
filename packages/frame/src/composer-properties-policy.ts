import type { MeasuredProperty } from '@segnavia/format'

export function propertyCssValue(property: Pick<MeasuredProperty, 'value' | 'unit'>): string {
  return `${String(Math.round(Math.max(0, property.value) * 10_000) / 10_000)}${property.unit}`
}

export function measuredProperties(properties: readonly MeasuredProperty[]): MeasuredProperty[] {
  return properties.filter((property, index, all) => all.findIndex((candidate) => candidate.id === property.id && candidate.name === property.name) === index)
}
