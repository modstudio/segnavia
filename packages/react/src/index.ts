import type { DeckController } from '@segnavia/frame'
import { type AuthoringController, type AuthoringHandlers, type AuthoringOptions, attachAuthoring } from '@segnavia/frame/authoring'
import '@segnavia/frame/player'
import { createElement, forwardRef, type ReactNode, type Ref, type RefObject, useEffect, useRef, useState } from 'react'
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
import { syncElementProps } from './react-props.ts'

type ElementWithController = HTMLElement & { controller?: DeckController | null }

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function createComponent<T extends HTMLElement, P extends { children?: ReactNode }>(tag: string) {
  return forwardRef<T, P>(function SegnaviaReactComponent(props, forwardedRef) {
    const element = useRef<T | null>(null)
    const previous = useRef<Record<string, unknown>>({})
    const { children, ...values } = props
    useEffect(() => {
      if (!element.current) return
      const next = values as Record<string, unknown>
      const cleanup = syncElementProps(element.current, next, previous.current)
      previous.current = next
      return cleanup
    })
    return createElement(
      tag,
      {
        ref: (node: T | null) => {
          element.current = node
          assignRef(forwardedRef, node)
        },
      },
      children as ReactNode,
    )
  })
}

export const Player = createComponent<HTMLElement & { controller: DeckController }, PlayerProps>('segnavia-player')
export const Stage = createComponent<ElementWithController, StageProps>('segnavia-stage')
export const Play = createComponent<ElementWithController, PlayProps>('segnavia-play')
export const Step = createComponent<ElementWithController, StepProps>('segnavia-step')
export const Track = createComponent<ElementWithController, TrackProps>('segnavia-track')
export const Counter = createComponent<ElementWithController, CounterProps>('segnavia-counter')
export const Time = createComponent<ElementWithController, TimeProps>('segnavia-time')
export const Mute = createComponent<ElementWithController, MuteProps>('segnavia-mute')
export const Captions = createComponent<ElementWithController, CaptionsProps>('segnavia-captions')
export const Caption = createComponent<ElementWithController, CaptionProps>('segnavia-caption')
export const Notes = createComponent<ElementWithController, NotesProps>('segnavia-notes')
export const Fullscreen = createComponent<ElementWithController, FullscreenProps>('segnavia-fullscreen')
export const Rail = createComponent<ElementWithController, RailProps>('segnavia-rail')

export function useDeckController(ref: RefObject<ElementWithController | null>): DeckController | null {
  const [controller, setController] = useState<DeckController | null>(null)
  const [, render] = useState(0)
  useEffect(() => {
    const next = ref.current?.controller ?? null
    setController(next)
    if (!next) return
    const changed = () => render((value) => value + 1)
    next.addEventListener('change', changed)
    return () => next.removeEventListener('change', changed)
  }, [ref.current])
  return controller
}

export function useAuthoring(
  playerRef: RefObject<(HTMLElement & { controller: DeckController }) | null>,
  handlers: AuthoringHandlers,
  options?: AuthoringOptions,
): AuthoringController | null {
  const [controller, setController] = useState<AuthoringController | null>(null)
  const initialHandlers = useRef(handlers)
  const initialOptions = useRef(options)
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    const attached = attachAuthoring(player as never, initialHandlers.current, initialOptions.current)
    setController(attached)
    return () => {
      attached.detach()
      setController(null)
    }
  }, [playerRef.current])
  useEffect(() => {
    void controller?.update(handlers, options)
  }, [controller, handlers, options])
  return controller
}

export type {
  AuthoringController,
  AuthoringErrorDetail,
  AuthoringHandlers,
  AuthoringOptions,
  DirtyChangeDetail,
  SaveNotesInput,
} from '@segnavia/frame/authoring'
export type { SegnaviaIntrinsicElements } from './jsx.ts'
export type * from './props.ts'
