import type { Deck, OriginApproval } from '@segnavia/format'
import { type FontsOptions, type ResolvedFonts, resolveFonts } from './page-fonts.ts'

interface FontResolution {
  deck: Deck
  input: FontsOptions | undefined
  origins: Iterable<OriginApproval> | undefined
  generation: number
  controller?: AbortController
  resolved?: ResolvedFonts
}

const resolutions = new WeakMap<object, FontResolution>()

export function cancelStageFonts(host: object): void {
  resolutions.get(host)?.controller?.abort()
  resolutions.delete(host)
}

export function stageFonts(
  host: object,
  deck: Deck,
  input: FontsOptions | undefined,
  origins: Iterable<OriginApproval> | undefined,
  current: () => boolean,
  ready: () => void,
  failed: (error: unknown) => void,
): ResolvedFonts | undefined {
  let state = resolutions.get(host)
  if (state?.deck === deck && state.input === input && state.origins === origins) return state.resolved
  state?.controller?.abort()
  state = { deck, input, origins, generation: (state?.generation ?? 0) + 1 }
  resolutions.set(host, state)
  if (!input) {
    state.resolved = { css: '', failures: [] }
    return state.resolved
  }
  const controller = new AbortController()
  state.controller = controller
  const generation = state.generation
  void resolveFonts(deck.style?.fonts, { ...input, origins, signal: controller.signal }).then(
    (resolved) => {
      const latest = resolutions.get(host)
      if (!current() || controller.signal.aborted || latest !== state || latest.generation !== generation) return
      latest.resolved = resolved
      latest.controller = undefined
      ready()
    },
    (error) => {
      const latest = resolutions.get(host)
      if (!current() || controller.signal.aborted || latest !== state || latest.generation !== generation) return
      latest.controller = undefined
      failed(error)
    },
  )
}
