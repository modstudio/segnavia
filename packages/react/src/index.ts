import type { DeckController } from '@segnavia/frame'
import { type AuthoringController, type AuthoringHandlers, type AuthoringOptions, attachAuthoring } from '@segnavia/frame/authoring'
import '@segnavia/frame/player'
import type { SegnaviaPlayer } from '@segnavia/frame/player'
import { createElement, forwardRef, type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { type AnyElementDescriptor, ELEMENTS, type ElementFor, type PropsFor } from './elements.ts'
import { syncElementProps } from './react-props.ts'

type ElementWithController = HTMLElement & { controller?: DeckController | null }

function assignRef<T>(ref: Ref<T>, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

export function createComponent<D extends AnyElementDescriptor>(descriptor: D) {
  type T = ElementFor<D>
  type P = PropsFor<D> & { children?: ReactNode }
  return forwardRef<T, P>(function SegnaviaReactComponent(props, forwardedRef) {
    const element = useRef<T | null>(null)
    const forwarded = useRef(forwardedRef)
    const previous = useRef<Record<string, unknown>>({})
    const { children, ...values } = props
    const setElement = useCallback((node: T | null) => {
      element.current = node
      assignRef(forwarded.current, node)
    }, [])
    useEffect(() => {
      if (forwarded.current === forwardedRef) return
      assignRef(forwarded.current, null)
      forwarded.current = forwardedRef
      assignRef(forwardedRef, element.current)
    }, [forwardedRef])
    useEffect(() => {
      if (!element.current) return
      const next = values as Record<string, unknown>
      const cleanup = syncElementProps(descriptor, element.current, next, previous.current)
      previous.current = next
      return cleanup
    })
    return createElement(
      descriptor.tag,
      {
        ref: setElement,
      },
      children as ReactNode,
    )
  })
}

export const Player = createComponent(ELEMENTS.player)
export const Stage = createComponent(ELEMENTS.stage)
export const Thumbnail = createComponent(ELEMENTS.thumbnail)
export const Page = createComponent(ELEMENTS.page)
export const Paper = createComponent(ELEMENTS.paper)
export const Document = createComponent(ELEMENTS.document)
export const Play = createComponent(ELEMENTS.play)
export const Step = createComponent(ELEMENTS.step)
export const Track = createComponent(ELEMENTS.track)
export const Counter = createComponent(ELEMENTS.counter)
export const Time = createComponent(ELEMENTS.time)
export const Mute = createComponent(ELEMENTS.mute)
export const Captions = createComponent(ELEMENTS.captions)
export const Caption = createComponent(ELEMENTS.caption)
export const Notes = createComponent(ELEMENTS.notes)
export const Fullscreen = createComponent(ELEMENTS.fullscreen)
export const Rail = createComponent(ELEMENTS.rail)

export function useDeckController(element: ElementWithController | null): DeckController | null {
  const [controller, setController] = useState<DeckController | null>(null)
  const [, render] = useState(0)
  useEffect(() => {
    const next = element?.controller ?? null
    setController(next)
    if (!next) return
    const changed = () => render((value) => value + 1)
    next.addEventListener('change', changed)
    return () => next.removeEventListener('change', changed)
  }, [element])
  return controller
}

export function useAuthoring(player: SegnaviaPlayer | null, handlers: AuthoringHandlers, options?: AuthoringOptions): AuthoringController | null {
  const [controller, setController] = useState<AuthoringController | null>(null)
  const latestHandlers = useRef(handlers)
  const latestOptions = useRef(options)
  latestHandlers.current = handlers
  latestOptions.current = options
  useEffect(() => {
    if (!player) return
    const attached = attachAuthoring(player, latestHandlers.current, latestOptions.current)
    setController(attached)
    return () => {
      void attached.detach()
      setController(null)
    }
  }, [player])
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
