import { Refusal } from '@segnavia/format'

export class LexiconRefusedError extends Refusal {
  readonly status: number
  readonly reason: string

  constructor(status: number, reason: string) {
    super('lexicon', `ElevenLabs refused the pronunciation dictionary: ${status} ${reason}. Correct the dictionary request and try again.`)
    this.name = 'LexiconRefusedError'
    this.status = status
    this.reason = reason
  }
}
