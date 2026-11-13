import type { SegnaviaRefusal } from './refusal.ts'

export interface PlayerRefusalStage extends EventTarget {
  readonly refusal: SegnaviaRefusal['refusal']
}

export function connectPlayerRefusal(root: Pick<ShadowRoot, 'querySelector'>, stage: PlayerRefusalStage): void {
  const sync = () => {
    const element = root.querySelector('segnavia-refusal') as SegnaviaRefusal | null
    if (element) element.refusal = stage.refusal
  }
  stage.addEventListener('refusalchange', sync)
}
