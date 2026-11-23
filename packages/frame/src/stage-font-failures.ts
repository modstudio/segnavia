import type { Deck, FontFailure } from '@segnavia/format'
import { dispatchFontFailures, MESSAGE } from './bridge.ts'

function failureKey(failure: FontFailure): string {
  return JSON.stringify([failure.family, failure.weight, failure.style, failure.reason])
}

export class StageFontFailures {
  private deck: Deck | null = null
  private reported = new Set<string>()

  begin(deck: Deck): void {
    if (this.deck === deck) return
    this.deck = deck
    this.reported.clear()
  }

  clear(): void {
    this.deck = null
    this.reported.clear()
  }

  report(target: EventTarget, failures: FontFailure[]): void {
    const fresh = failures.filter((failure) => {
      const key = failureKey(failure)
      if (this.reported.has(key)) return false
      this.reported.add(key)
      return true
    })
    if (fresh.length > 0) dispatchFontFailures(target, { type: MESSAGE.fontFailures, failures: fresh })
  }
}

const stageFailures = new WeakMap<object, StageFontFailures>()

export function stageFontFailures(host: object): StageFontFailures {
  const current = stageFailures.get(host)
  if (current) return current
  const created = new StageFontFailures()
  stageFailures.set(host, created)
  return created
}

export function resetStageFontFailures(host: object): void {
  stageFailures.delete(host)
}
