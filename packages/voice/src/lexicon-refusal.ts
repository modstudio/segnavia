import { Refusal } from '@segnavia/format'

const collisionSentence = (terms: readonly string[]): string =>
  `The terms ${terms.map((term) => JSON.stringify(term)).join(', ')} collide when caseSensitive is false.`

export class LexiconCollisionError extends Refusal {
  readonly collisions: readonly (readonly string[])[]

  constructor(collisions: readonly (readonly string[])[]) {
    const refusals = collisions.map((terms) => ({
      code: 'lexicon-collision',
      subject: terms[0]?.toLocaleLowerCase(),
      message: collisionSentence(terms),
    }))
    super(
      'lexicon-collision',
      `${refusals.map((refusal) => refusal.message).join(' ')} Set caseSensitive to true, or remove entries so that one term stays in each collision group.`,
      { refusals },
    )
    this.name = 'LexiconCollisionError'
    this.collisions = collisions
  }
}

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
