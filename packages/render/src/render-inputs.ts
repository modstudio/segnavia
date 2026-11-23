import { isLimitExceeded, Refusal } from '@segnavia/format'
import type { InputRefusal, RenderInputRef } from './errors.ts'

export interface SettledRenderInput<T> extends RenderInputRef {
  value: T
}

export function renderInputRef(input: unknown, index: number): RenderInputRef {
  if (!input || typeof input !== 'object' || !('id' in input)) return { index }
  return { index, ...(typeof input.id === 'string' ? { id: input.id } : {}) }
}

export function nameFailedInput(error: unknown, ref: RenderInputRef): never {
  if (error instanceof Error) {
    error.message = `Input ${ref.index + 1}${ref.id === undefined ? '' : ` (${ref.id})`} could not be rendered: ${error.message}`
  }
  throw error
}

export function isInputScoped(error: unknown): error is InputRefusal['error'] {
  return error instanceof Refusal || isLimitExceeded(error)
}

export async function settleRenderInputs<Input, Value>(
  inputs: readonly Input[],
  work: (input: Input, index: number) => Promise<Value>,
  indexOf: (input: Input, position: number) => number = (_input, position) => position,
): Promise<{ accepted: Array<SettledRenderInput<Value>>; refused: InputRefusal[] }> {
  const settled = await Promise.all(
    inputs.map(async (input, position) => {
      const index = indexOf(input, position)
      const ref = renderInputRef(input, index)
      try {
        return { ...ref, value: await work(input, position) }
      } catch (error) {
        if (!isInputScoped(error)) nameFailedInput(error, ref)
        return { ...ref, refusal: { ...ref, error } }
      }
    }),
  )
  const accepted: Array<SettledRenderInput<Value>> = []
  const refused: InputRefusal[] = []
  for (const entry of settled) {
    if ('value' in entry) accepted.push({ index: entry.index, ...(entry.id === undefined ? {} : { id: entry.id }), value: entry.value as Value })
    else refused.push(entry.refusal)
  }
  return { accepted, refused }
}
