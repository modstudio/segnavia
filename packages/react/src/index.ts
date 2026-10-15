import type { DeckController } from '@segnavia/frame'
import { type AuthoringController, type AuthoringHandlers, type AuthoringOptions, attachAuthoring } from '@segnavia/frame/authoring'
import '@segnavia/frame/player'
import { createElement, forwardRef, type ReactNode, type Ref, type RefObject, useEffect, useRef, useState } from 'react'
import { syncElementProps } from './react-props.ts'

export interface FrameElementProps {
  children?: ReactNode
  labels?: unknown
  css?: string
  cspExtra?: string
  resolveSlide?: unknown
  controller?: DeckController | null
  transition?: unknown
  src?: string
  theme?: string
  notes?: boolean
  rail?: boolean
  hash?: string
  prefetch?: boolean
  playback?: 'step' | 'continuous'
  captions?: 'on' | 'off' | 'viewer'
  presentation?: 'window' | 'native' | 'off'
  transitionDuration?: number
  for?: string
  to?: 'previous' | 'next'
  mode?: 'window' | 'native'
  target?: string
  fit?: 'box' | 'viewport'
  neighbors?: boolean
  unstyled?: boolean
  slot?: string
  [name: string]: unknown
}

type ElementWithController = HTMLElement & { controller?: DeckController | null }

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function createComponent<T extends HTMLElement>(tag: string) {
  return forwardRef<T, FrameElementProps>(function SegnaviaReactComponent(props, forwardedRef) {
    const element = useRef<T | null>(null)
    const previous = useRef<Record<string, unknown>>({})
    const { children, ...values } = props
    useEffect(() => {
      if (!element.current) return
      const cleanup = syncElementProps(element.current, values, previous.current)
      previous.current = values
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

export const Player = createComponent<HTMLElement & { controller: DeckController }>('segnavia-player')
export const Stage = createComponent<ElementWithController>('segnavia-stage')
export const Play = createComponent<ElementWithController>('segnavia-play')
export const Step = createComponent<ElementWithController>('segnavia-step')
export const Track = createComponent<ElementWithController>('segnavia-track')
export const Counter = createComponent<ElementWithController>('segnavia-counter')
export const Time = createComponent<ElementWithController>('segnavia-time')
export const Mute = createComponent<ElementWithController>('segnavia-mute')
export const Captions = createComponent<ElementWithController>('segnavia-captions')
export const Caption = createComponent<ElementWithController>('segnavia-caption')
export const Notes = createComponent<ElementWithController>('segnavia-notes')
export const Fullscreen = createComponent<ElementWithController>('segnavia-fullscreen')
export const Rail = createComponent<ElementWithController>('segnavia-rail')

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

export type { SegnaviaIntrinsicElements } from './jsx.ts'
export type { AuthoringController, AuthoringHandlers, AuthoringOptions }
