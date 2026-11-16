import { Refusal } from '@segnavia/format'

function placementMessage(id: string): string {
  return `Placement ${id} holds a sound, which cannot print. Remove the placement, or place an image of its cover instead, to clear this refusal.`
}

export class SoundPrintRefusedError extends Refusal {
  override name = 'SoundPrintRefusedError'
  readonly placements: readonly string[]

  constructor(placements: readonly string[]) {
    const first = placements[0]
    if (first === undefined) throw new TypeError('SoundPrintRefusedError needs at least one placement')
    super('sound-print', placementMessage(first), {
      subject: first,
      refusals: placements.map((id) => ({ code: 'sound-print', subject: id, message: placementMessage(id) })),
    })
    this.placements = placements
  }
}

export function refuseSoundsForPrint(answers: readonly { placement: string; answer: { kind: string } | undefined }[], purpose: 'screen' | 'print'): void {
  if (purpose !== 'print') return
  const placements = answers.flatMap(({ placement, answer }) => (answer?.kind === 'sound' ? [placement] : []))
  if (placements.length > 0) throw new SoundPrintRefusedError(placements)
}
