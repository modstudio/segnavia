import type { Measurements } from '@segnavia/format'

export function measurementsWithBreaks(measurements: Measurements, breaks: string[]): Measurements {
  const remaining = new Set(breaks)
  const flows = measurements.flows.map((flow) =>
    flow.kind === 'fixed'
      ? flow
      : {
          ...flow,
          blocks: flow.blocks.map((block) => {
            if (block.id === undefined || !remaining.delete(block.id)) return block
            return { ...block, breakBefore: true }
          }),
        },
  )
  const missing = breaks.find((id) => remaining.has(id))
  if (missing !== undefined)
    throw new Error(
      `break ${missing} names no measured flowing block; remove it from breaks, or compute a new plan when it came from a saved plan, to clear this refusal`,
    )
  return { ...measurements, flows }
}
