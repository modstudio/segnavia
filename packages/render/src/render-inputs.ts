import { Refusal } from '@segnavia/format'
import { type InputRefusal, RenderRefusedError } from './errors.ts'

export interface SettledRenderInput<T> {
  index: number
  id?: string
  value: T
}

function inputId(input: unknown): string | undefined {
  if (!input || typeof input !== 'object' || !('id' in input)) return undefined
  return typeof input.id === 'string' ? input.id : undefined
}

function refusal(error: unknown): Refusal {
  if (error instanceof Refusal) return error
  return new RenderRefusedError(error instanceof Error ? error.message : String(error), { cause: error })
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
        return { index, refusal: { index, ...(inputId(input) === undefined ? {} : { id: inputId(input) }), error: refusal(error) } }
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
