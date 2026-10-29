export class SlideFrameError extends Error {
  constructor(
    message: string,
    readonly slideId: string,
    readonly index: number,
  ) {
    super(message)
    this.name = 'SlideFrameError'
  }
}
