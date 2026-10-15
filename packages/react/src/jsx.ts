import type { HTMLAttributes } from 'react'
import type { FrameElementProps } from './index.ts'

type TagProps = HTMLAttributes<HTMLElement> & FrameElementProps

export interface SegnaviaIntrinsicElements {
  'segnavia-player': TagProps
  'segnavia-stage': TagProps
  'segnavia-play': TagProps
  'segnavia-step': TagProps
  'segnavia-track': TagProps
  'segnavia-counter': TagProps
  'segnavia-time': TagProps
  'segnavia-mute': TagProps
  'segnavia-captions': TagProps
  'segnavia-caption': TagProps
  'segnavia-notes': TagProps
  'segnavia-fullscreen': TagProps
  'segnavia-rail': TagProps
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends SegnaviaIntrinsicElements {}
  }
}
