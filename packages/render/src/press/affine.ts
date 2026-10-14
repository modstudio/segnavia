export const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0]

function affineComponent(values: readonly number[], index: number): number {
  return values[index] ?? 0
}

export function multiplyAffine(left: readonly number[], right: readonly number[]): number[] {
  const a0 = affineComponent(left, 0)
  const b0 = affineComponent(left, 1)
  const c0 = affineComponent(left, 2)
  const d0 = affineComponent(left, 3)
  const e0 = affineComponent(left, 4)
  const f0 = affineComponent(left, 5)
  const a1 = affineComponent(right, 0)
  const b1 = affineComponent(right, 1)
  const c1 = affineComponent(right, 2)
  const d1 = affineComponent(right, 3)
  const e1 = affineComponent(right, 4)
  const f1 = affineComponent(right, 5)
  return [a0 * a1 + c0 * b1, b0 * a1 + d0 * b1, a0 * c1 + c0 * d1, b0 * c1 + d0 * d1, a0 * e1 + c0 * f1 + e0, b0 * e1 + d0 * f1 + f0]
}

export function invertAffine(matrix: readonly number[]): number[] | undefined {
  const a = affineComponent(matrix, 0)
  const b = affineComponent(matrix, 1)
  const c = affineComponent(matrix, 2)
  const d = affineComponent(matrix, 3)
  const e = affineComponent(matrix, 4)
  const f = affineComponent(matrix, 5)
  const det = a * d - b * c
  if (det === 0 || !Number.isFinite(det)) return undefined
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

export function applyAffine(matrix: readonly number[], x: number, y: number): { x: number; y: number } {
  return {
    x: affineComponent(matrix, 0) * x + affineComponent(matrix, 2) * y + affineComponent(matrix, 4),
    y: affineComponent(matrix, 1) * x + affineComponent(matrix, 3) * y + affineComponent(matrix, 5),
  }
}
