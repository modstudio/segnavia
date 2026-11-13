import type { Refusal } from '@segnavia/format'
import type { DeckState, ResolvedContent } from './controller-types.ts'

export type StageRefusalScope = 'deck' | 'slide'

export interface StageRefusalRecord {
  refusal: Refusal
  scope: StageRefusalScope
  deck: DeckState['deck']
  content: ResolvedContent | null
}

export function stageRefusalRecord(refusal: Refusal, scope: StageRefusalScope, state: DeckState): StageRefusalRecord {
  return {
    refusal,
    scope,
    deck: state.deck,
    content: state.content,
  }
}

export function applicableStageRefusal(record: StageRefusalRecord | null, state: DeckState): StageRefusalRecord | null {
  if (!record || state.deck !== record.deck) return null
  if (record.scope === 'deck') return record
  if (state.slide?.id !== record.refusal.subject || state.content !== record.content) return null
  return record
}
