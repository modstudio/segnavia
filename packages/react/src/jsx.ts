import type {
  CaptionProps,
  CaptionsProps,
  CounterProps,
  FullscreenProps,
  MuteProps,
  NotesProps,
  PlayerProps,
  PlayProps,
  RailProps,
  StageProps,
  StepProps,
  TimeProps,
  TrackProps,
} from './props.ts'

export interface SegnaviaIntrinsicElements {
  'segnavia-player': PlayerProps
  'segnavia-stage': StageProps
  'segnavia-play': PlayProps
  'segnavia-step': StepProps
  'segnavia-track': TrackProps
  'segnavia-counter': CounterProps
  'segnavia-time': TimeProps
  'segnavia-mute': MuteProps
  'segnavia-captions': CaptionsProps
  'segnavia-caption': CaptionProps
  'segnavia-notes': NotesProps
  'segnavia-fullscreen': FullscreenProps
  'segnavia-rail': RailProps
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends SegnaviaIntrinsicElements {}
  }
}
