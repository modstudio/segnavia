import type { BoardLabel, LabelShapeResult } from '@segnavia/format'

export function sizeMeasuredLabels(labels: readonly BoardLabel[], shape: (label: BoardLabel) => LabelShapeResult | undefined): BoardLabel[] {
  return labels.map((label) => {
    if (label.size) return label
    const result = shape(label)
    return result?.source === 'measured' ? { ...label, size: result.shape } : label
  })
}
