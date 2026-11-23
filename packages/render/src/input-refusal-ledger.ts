import { type InputRefusal, RenderInputsRefusedError } from './errors.ts'

export interface InputRefusalLedger {
  add(entries: readonly InputRefusal[]): void
  entries(): InputRefusal[]
}

export function inputRefusalLedger(initial: readonly InputRefusal[] = []): InputRefusalLedger {
  const refusals = new Map<number, InputRefusal>()
  const ledger = {
    add(entries: readonly InputRefusal[]) {
      for (const entry of entries) refusals.set(entry.index, entry)
    },
    entries() {
      return [...refusals.values()].sort((left, right) => left.index - right.index)
    },
  }
  ledger.add(initial)
  return ledger
}

export function refuseOrContinue(ledger: InputRefusalLedger, survivors: number, skipRefused: boolean): InputRefusal[] {
  const refused = ledger.entries()
  if (refused.length > 0 && (!skipRefused || survivors === 0)) throw new RenderInputsRefusedError(refused)
  return refused
}
