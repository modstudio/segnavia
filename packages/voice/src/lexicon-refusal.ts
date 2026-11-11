export class LexiconRefusedError extends Error {
  readonly status: number
  readonly reason: string

  constructor(status: number, reason: string) {
    super(`ElevenLabs refused the pronunciation dictionary: ${status} ${reason}. Correct the dictionary request and try again.`)
    this.name = 'LexiconRefusedError'
    this.status = status
    this.reason = reason
  }
}
