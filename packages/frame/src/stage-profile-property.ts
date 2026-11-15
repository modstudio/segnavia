import type { PreflightProfileInput } from '@segnavia/format'
import { surfacePreflightFor } from './surface-preflight.ts'

export function defineStageProfileProperty(prototype: object, changed: (stage: HTMLElement) => void): void {
  Object.defineProperty(prototype, 'profile', {
    configurable: true,
    get(this: HTMLElement): PreflightProfileInput {
      return surfacePreflightFor(this).profile
    },
    set(this: HTMLElement, value: PreflightProfileInput) {
      surfacePreflightFor(this).profile = value
      changed(this)
    },
  })
}
