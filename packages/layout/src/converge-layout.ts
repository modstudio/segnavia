export interface LayoutStep<T> {
  plan: T
  settled: boolean
}

export interface LayoutWarning {
  name: 'layout-did-not-converge'
  steps: number
}

export type ConvergedLayout<T> = { plan: T; converged: true; warnings: [] } | { plan: T; converged: false; warnings: [LayoutWarning] }

export function convergeLayout<T>(first: T, step: (plan: T) => LayoutStep<T> | null, cap: number): ConvergedLayout<T> | null {
  let plan = first
  for (let steps = 0; steps < cap; steps += 1) {
    const next = step(plan)
    if (next === null) return null
    plan = next.plan
    if (next.settled) return { plan, converged: true, warnings: [] }
  }
  return { plan, converged: false, warnings: [{ name: 'layout-did-not-converge', steps: cap }] }
}
