// The words the styled components and the player say, in the host's
// language. A host passes its own; these are the defaults.

import { defaultFrameTitle, type FrameTitle } from './frame-title.ts'

export interface PlayerLabels {
  play: string
  pause: string
  previous: string
  next: string
  slide: (number: number, total: number) => string
  frameTitle: FrameTitle
  slides: string
  notes: string
  showNotes: string
  hideNotes: string
  enterFullscreen: string
  exitFullscreen: string
  player: string
}

export const ENGLISH_LABELS: PlayerLabels = {
  play: 'Play',
  pause: 'Pause',
  previous: 'Previous slide',
  next: 'Next slide',
  slide: (number, total) => `Slide ${number} of ${total}`,
  frameTitle: defaultFrameTitle,
  slides: 'Slides',
  notes: 'Notes',
  showNotes: 'Show notes',
  hideNotes: 'Hide notes',
  enterFullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  player: 'Slide player',
}
