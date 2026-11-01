export class FontFaceRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FontFaceRefusedError'
  }
}
