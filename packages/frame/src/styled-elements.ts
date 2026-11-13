export const STYLED_ELEMENTS = {
  player: 'segnavia-player',
  refusal: 'segnavia-refusal',
  play: 'segnavia-play',
  step: 'segnavia-step',
  counter: 'segnavia-counter',
  fullscreen: 'segnavia-fullscreen',
  track: 'segnavia-track',
  rail: 'segnavia-rail',
  time: 'segnavia-time',
  mute: 'segnavia-mute',
  captions: 'segnavia-captions',
  caption: 'segnavia-caption',
  notes: 'segnavia-notes',
  paperPicker: 'segnavia-paper-picker',
} as const

export const STYLED_ELEMENT_NAMES = Object.values(STYLED_ELEMENTS)

export const CONTROLLER_STYLED_ELEMENTS = [
  STYLED_ELEMENTS.play,
  STYLED_ELEMENTS.step,
  STYLED_ELEMENTS.counter,
  STYLED_ELEMENTS.fullscreen,
  STYLED_ELEMENTS.track,
  STYLED_ELEMENTS.rail,
  STYLED_ELEMENTS.time,
  STYLED_ELEMENTS.mute,
  STYLED_ELEMENTS.captions,
  STYLED_ELEMENTS.caption,
  STYLED_ELEMENTS.notes,
] as const
