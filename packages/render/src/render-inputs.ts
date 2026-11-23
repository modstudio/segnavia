import { isLimitExceeded, Refusal } from '@segnavia/format'
import type { InputRefusal } from './errors.ts'

export interface SettledRenderInput<T> {
  index: number
  id?: string
  value: T
}

function inputId(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || !('id' in input)) return undefined
  return typeof input.id === 'string' ? input.id : undefined
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
      try {
        return { index, value: await work(input, position) }
      } catch (error) {
        if (!isInputScoped(error)) throw error
        return { index, refusal: { index, ...(inputId(input) === undefined ? {} : { id: inputId(input) }), error } }
      }
    }),
  )
  const accepted: Array<SettledRenderInput<Value>> = []
  const refused: InputRefusal[] = []
  for (const entry of settled) {
    if ('value' in entry) accepted.push({ index: entry.index, value: entry.value as Value })
    else refused.push(entry.refusal)
  }
  return { accepted, refused }
}
