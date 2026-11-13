import { Refusal } from './refusal.ts'

export class FontFaceRefusedError extends Refusal {
  constructor(message: string) {
    super('font-face', message)
    this.name = 'FontFaceRefusedError'
  }
}
