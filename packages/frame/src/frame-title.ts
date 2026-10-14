export type FrameTitle = (deckTitle: string, slideNumber: number) => string

export const defaultFrameTitle: FrameTitle = (deckTitle, slideNumber) => `${deckTitle} — slide ${slideNumber}`
