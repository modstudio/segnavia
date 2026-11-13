import { Refusal } from './refusal.ts'

export class PlacementRefusedError extends Refusal {
  override name = 'PlacementRefusedError'

  constructor(message: string) {
    super('placement', message)
  }
}
