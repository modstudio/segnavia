// The words the styled components and the player say, in the host's
// language. A host passes its own; these are the defaults.

export interface PlayerLabels {
  play: string
  pause: string
  previous: string
  next: string
  slide: (number: number, total: number) => string
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
  slides: 'Slides',
  notes: 'Notes',
  showNotes: 'Show notes',
  hideNotes: 'Hide notes',
  enterFullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  player: 'Slide player',
}
