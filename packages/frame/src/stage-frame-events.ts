import type { ResolvedContent } from './controller.ts'

export interface StageFrameDetail {
  slideId: string
  content: ResolvedContent
}

export function stageFrameEvents(target: EventTarget) {
  const dispatch = (name: 'segnavia-frame-mount' | 'segnavia-frame-release', slideId: string, content: ResolvedContent) => {
    target.dispatchEvent(new CustomEvent<StageFrameDetail>(name, { detail: { slideId, content } }))
  }
  return {
    mounted: (slideId: string, content: ResolvedContent) => dispatch('segnavia-frame-mount', slideId, content),
    released: (slideId: string, content: ResolvedContent) => dispatch('segnavia-frame-release', slideId, content),
  }
}
