// The words the styled components and the player say, in the host's
// language. A host passes its own; these are the defaults.

import { isHebrew } from '@segnavia/format'
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
  printsAtStart: string
  printsAt: (seconds: string) => string
  useThisFrame: string
  resetPrintMoment: string
  noSpeakerNotes: string
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

export interface BoardLabels {
  itemAction: (label: string, name: string) => string
}

export const ENGLISH_BOARD_LABELS: BoardLabels = {
  itemAction: (label, name) => `${label} ${name}`,
}

export function boardLabels(labels: Partial<BoardLabels>): BoardLabels {
  return { ...ENGLISH_BOARD_LABELS, ...labels }
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
  editNotes: 'Notes',
  savingNotes: 'Saving…',
  savedNotes: 'Saved',
  tryNotesAgain: 'Try again',
  printsAtStart: 'Prints at the start',
  printsAt: (seconds) => `Prints at ${seconds} s`,
  useThisFrame: 'Use this frame',
  resetPrintMoment: 'Reset',
  noSpeakerNotes: 'No speaker notes',
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

export function bookLabel(lang: string | undefined): string {
  return isHebrew(lang) ? 'ספר' : 'Book'
}
