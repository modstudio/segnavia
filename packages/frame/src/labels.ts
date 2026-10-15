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
  rail: string
  editNotes: string
  savingNotes: string
  savedNotes: string
  tryNotesAgain: string
  notes: string
  showNotes: string
  hideNotes: string
  enterFullscreen: string
  exitFullscreen: string
  mute: string
  unmute: string
  showCaptions: string
  hideCaptions: string
  seek: string
  time: (elapsed: string, total: string) => string
  enterPresentation: string
  exitPresentation: string
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
  rail: 'Slides',
  editNotes: 'Edit notes',
  savingNotes: 'Saving…',
  savedNotes: 'Saved',
  tryNotesAgain: 'Try again',
  notes: 'Notes',
  showNotes: 'Show notes',
  hideNotes: 'Hide notes',
  enterFullscreen: 'Full screen',
  exitFullscreen: 'Exit full screen',
  mute: 'Mute',
  unmute: 'Unmute',
  showCaptions: 'Show captions',
  hideCaptions: 'Hide captions',
  seek: 'Seek',
  time: (elapsed, total) => `${elapsed} / ${total}`,
  enterPresentation: 'Present',
  exitPresentation: 'Exit presentation',
  player: 'Slide player',
}

export function playerLabels(labels: Partial<PlayerLabels>): PlayerLabels {
  return { ...ENGLISH_LABELS, ...labels }
}
