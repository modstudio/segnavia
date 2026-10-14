import type { Harness } from './harness.ts'

interface TransitionHost {
  controller: { go(index: number): Promise<void> }
  stage: HTMLElement
  loadTransition(kind: 'none' | 'fade' | 'slide', scripts: 'refuse' | 'sandboxed', dir?: 'ltr' | 'rtl'): Promise<void>
  loadHeldNeighbor(): Promise<void>
}

interface TransitionSample {
  kind: 'fade' | 'slide'
  scripts: 'refuse' | 'sandboxed'
  observedKind: string | null
  frames: number
  emptyFrames: number
  monotonic: boolean
  range: boolean
  first: number
  last: number
  target: string | null
  stableWindow: boolean | null
}

export async function verifyDeckTransitions(h: Harness) {
  const { page, check } = h
  const samples = await sampleKindsAndModes(h)
  for (const sample of samples) {
    check(
      `deck host: ${sample.kind} transition is monotonic with no empty frame under ${sample.scripts} scripts`,
      sample.frames >= 4 && sample.monotonic && sample.range && sample.emptyFrames === 0,
      JSON.stringify(sample),
    )
  }
  const refusedSamples = samples.filter((sample) => sample.scripts === 'refuse')
  check(
    'deck host: refused-script fade and slide preserve the loaded neighbor document',
    refusedSamples.every((sample) => sample.stableWindow === true),
    JSON.stringify(refusedSamples),
  )

  const rtl = await sampleTransition(h, 'slide', 'refuse', 'rtl')
  check('deck host: a right-to-left forward slide enters from the left', rtl.first < 0 && rtl.monotonic, JSON.stringify(rtl))

  const overridden = await sampleTransition(h, 'slide', 'refuse', 'ltr', { kind: 'fade', duration: 180 })
  check('deck host: a host transition override beats the deck setting', overridden.observedKind === 'fade' && overridden.range, JSON.stringify(overridden))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reduced = await sampleTransition(h, 'slide', 'refuse')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  check('deck host: reduced motion forces an instant turn', reduced.frames === 0 && reduced.target === 'transition-2', JSON.stringify(reduced))

  const none = await noneFacts(h)
  check('deck host: none keeps the unchanged neighbor turn and adds no transition attributes', none.attributes === 0 && none.same, JSON.stringify(none))

  const interrupted = await interruptedFacts(h)
  check(
    'deck host: a second turn during a transition settles only on its target',
    interrupted.target === 'transition-3' && interrupted.visible === 1 && interrupted.canvases === 1,
    JSON.stringify(interrupted),
  )

  const neighbor = await neighborWindowFacts(h)
  check(
    'deck host: animated refused turns replenish and reuse the next neighbor',
    neighbor.mounted && neighbor.sameWindow && neighbor.addedDuringSecondTurn === 0,
    JSON.stringify(neighbor),
  )

  const precommit = await precommitInterruptionFacts(h)
  check(
    'deck host: interrupting a refused neighbor before motion keeps its document',
    precommit.sameWindow && precommit.target === 'transition-3',
    JSON.stringify(precommit),
  )

  const held = await heldNeighborFacts(h)
  check(
    'deck host: a turn waits for a loading neighbor, then animates its existing painted frame',
    held.waited && held.animated && held.sameWindow && held.emptyFrames === 0 && held.addedFrames === 0,
    JSON.stringify(held),
  )
}

async function sampleKindsAndModes(h: Harness): Promise<TransitionSample[]> {
  const samples: TransitionSample[] = []
  for (const scripts of ['refuse', 'sandboxed'] as const) {
    for (const kind of ['fade', 'slide'] as const) samples.push(await sampleTransition(h, kind, scripts))
  }
  return samples
}

async function noneFacts(h: Harness) {
  return h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    await host.loadTransition('none', 'refuse')
    const incoming = document.querySelector<HTMLIFrameElement>('#deck [data-slide-id="transition-2"] iframe')
    await host.controller.go(1)
    const attributes = document.querySelectorAll('#deck [data-transition],#deck [data-entering],#deck [data-leaving]').length
    return { attributes, same: document.querySelector('#deck [data-active] iframe') === incoming }
  })
}

async function interruptedFacts(h: Harness) {
  return h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    await host.loadTransition('slide', 'sandboxed')
    host.stage.setAttribute('transition-duration', '1000')
    await host.controller.go(1)
    const waitFor = (predicate: () => boolean) =>
      new Promise<void>((resolve) => {
        const poll = () => (predicate() ? resolve() : requestAnimationFrame(poll))
        poll()
      })
    await waitFor(() => Boolean(document.querySelector('#deck [data-running]')))
    await host.controller.go(2)
    await waitFor(
      () =>
        document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'transition-3' && !document.querySelector('#deck [data-transition]'),
    )
    return {
      target: document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id'),
      visible: document.querySelectorAll('#deck [data-active]').length,
      canvases: document.querySelectorAll('#deck .segnavia-stage__canvas').length,
    }
  })
}

async function neighborWindowFacts(h: Harness) {
  return h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    const stage = document.querySelector('#deck') as HTMLElement
    await host.loadTransition('fade', 'refuse')
    const waitFor = (predicate: () => boolean) =>
      new Promise<void>((resolve) => {
        const poll = () => (predicate() ? resolve() : requestAnimationFrame(poll))
        poll()
      })
    await host.controller.go(1)
    await waitFor(() => stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === 'transition-2' && !stage.querySelector('[data-transition]'))
    await waitFor(() => Boolean(stage.querySelector('[data-slide-id="transition-3"] iframe')))
    const neighbor = stage.querySelector<HTMLIFrameElement>('[data-slide-id="transition-3"] iframe')
    const before = neighbor?.contentWindow
    let addedDuringSecondTurn = 0
    const observer = new MutationObserver((records) => {
      addedDuringSecondTurn += records.reduce(
        (count, record) => count + [...record.addedNodes].filter((node) => node instanceof Element && node.matches('.segnavia-stage__canvas')).length,
        0,
      )
    })
    observer.observe(stage, { childList: true })
    await host.controller.go(2)
    await waitFor(() => stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === 'transition-3' && !stage.querySelector('[data-transition]'))
    observer.disconnect()
    return {
      mounted: Boolean(neighbor),
      sameWindow: Boolean(before) && neighbor?.contentWindow === before,
      addedDuringSecondTurn,
    }
  })
}

async function precommitInterruptionFacts(h: Harness) {
  return h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    const stage = document.querySelector('#deck') as HTMLElement
    await host.loadTransition('slide', 'refuse')
    host.stage.setAttribute('transition-duration', '1000')
    const reused = stage.querySelector<HTMLIFrameElement>('[data-slide-id="transition-2"] iframe')
    const before = reused?.contentWindow
    const waitFor = (predicate: () => boolean) =>
      new Promise<void>((resolve) => {
        const poll = () => (predicate() ? resolve() : requestAnimationFrame(poll))
        poll()
      })
    const waitForIncoming = () =>
      new Promise<void>((resolve) => {
        const observer = new MutationObserver(() => {
          if (!stage.querySelector('[data-slide-id="transition-2"][data-incoming]')) return
          observer.disconnect()
          resolve()
        })
        observer.observe(stage, { attributes: true, childList: true, subtree: true })
      })
    const incoming = waitForIncoming()
    void host.controller.go(1)
    await incoming
    await host.controller.go(2)
    await waitFor(() => stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === 'transition-3' && !stage.querySelector('[data-transition]'))
    return {
      sameWindow: Boolean(before) && reused?.isConnected === true && reused.contentWindow === before,
      target: stage.querySelector('[data-active]')?.getAttribute('data-slide-id') ?? null,
    }
  })
}

async function heldNeighborFacts(h: Harness) {
  await h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    const stage = document.querySelector('#deck') as HTMLElement
    await host.loadHeldNeighbor()
    const frame = stage.querySelector<HTMLIFrameElement>('[data-slide-id="held"] iframe')
    const facts = {
      frame,
      frameWindow: frame?.contentWindow,
      animated: false,
      emptyFrames: 0,
      addedFrames: 0,
      sampling: true,
    }
    ;(window as unknown as { __heldNeighborFacts: typeof facts }).__heldNeighborFacts = facts
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        facts.addedFrames += [...record.addedNodes].filter(
          (node) => node instanceof HTMLIFrameElement || (node instanceof Element && Boolean(node.querySelector('iframe'))),
        ).length
        if ((record.target as HTMLElement).dataset.transition) facts.animated = true
      }
    })
    observer.observe(stage, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-transition'] })
    const sample = () => {
      if (!facts.sampling) return observer.disconnect()
      const stageBox = stage.getBoundingClientRect()
      const painted = [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].some((canvas) => {
        const style = getComputedStyle(canvas)
        const box = canvas.getBoundingClientRect()
        return Number(style.opacity) > 0 && box.right > stageBox.left && box.left < stageBox.right
      })
      if (!painted) facts.emptyFrames++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    void host.controller.go(1)
  })
  await h.page.waitForTimeout(100)
  const waited = await h.page.evaluate(
    () =>
      document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'held-start' &&
      !document.querySelector('#deck [data-slide-id="held"][data-transition]'),
  )
  h.releaseHeldFrames()
  await h.page.waitForFunction(
    () => document.querySelector('#deck [data-active]')?.getAttribute('data-slide-id') === 'held' && !document.querySelector('#deck [data-transition]'),
  )
  const result = await h.page.evaluate((didWait) => {
    const facts = (
      window as unknown as {
        __heldNeighborFacts: {
          frame: HTMLIFrameElement | null
          frameWindow: Window | null | undefined
          animated: boolean
          emptyFrames: number
          addedFrames: number
          sampling: boolean
        }
      }
    ).__heldNeighborFacts
    facts.sampling = false
    return {
      waited: didWait,
      animated: facts.animated,
      sameWindow: Boolean(facts.frameWindow) && facts.frame?.contentWindow === facts.frameWindow,
      emptyFrames: facts.emptyFrames,
      addedFrames: facts.addedFrames,
    }
  }, waited)
  await h.page.evaluate(async () => {
    const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
    await host.loadTransition('none', 'refuse')
  })
  return result
}

async function sampleTransition(
  h: Harness,
  kind: 'fade' | 'slide',
  scripts: 'refuse' | 'sandboxed',
  dir: 'ltr' | 'rtl' = 'ltr',
  override?: { kind: 'fade' | 'slide'; duration: number },
): Promise<TransitionSample> {
  await prepareTransition(h, kind, scripts, dir, override)
  return h.page.evaluate(
    async ({ selectedKind, selectedScripts }) => {
      const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
      const stage = document.querySelector('#deck') as HTMLElement
      const incomingFrame = stage.querySelector<HTMLIFrameElement>('[data-slide-id="transition-2"] iframe')
      const incomingWindow = selectedScripts === 'refuse' ? incomingFrame?.contentWindow : null
      const values: number[] = []
      const facts = { emptyFrames: 0, observedKind: null as string | null }
      const hasPaintedCanvas = () => {
        const stageBox = stage.getBoundingClientRect()
        return [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].some((canvas) => {
          const style = getComputedStyle(canvas)
          const box = canvas.getBoundingClientRect()
          return Number(style.opacity) > 0 && box.right > stageBox.left && box.left < stageBox.right
        })
      }
      const recordIncoming = () => {
        const incoming = stage.querySelector<HTMLElement>('[data-slide-id="transition-2"]')
        if (!incoming?.dataset.transition) return
        facts.observedKind = incoming.dataset.transition
        const style = getComputedStyle(incoming)
        if (selectedKind === 'fade' || facts.observedKind === 'fade') values.push(Number(style.opacity))
        else {
          const box = incoming.getBoundingClientRect()
          const stageBox = stage.getBoundingClientRect()
          const restingLeft = stageBox.left + (stageBox.width - box.width) / 2
          values.push(((box.left - restingLeft) / box.width) * 100)
        }
      }
      const turn = host.controller.go(1)
      await new Promise<void>((resolve) => {
        const sample = () => {
          recordIncoming()
          if (!hasPaintedCanvas()) facts.emptyFrames++
          const settled = stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === 'transition-2' && !stage.querySelector('[data-transition]')
          if (settled) resolve()
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
      await turn
      const normalized = facts.observedKind === 'fade' ? values : values.map((value) => Math.abs(value))
      const decreasing = normalized.every((value, index) => index === 0 || value <= (normalized[index - 1] ?? value) + 0.5)
      const increasing = values.every((value, index) => index === 0 || value + 0.01 >= (values[index - 1] ?? value))
      const first = values[0] ?? 0
      const last = values.at(-1) ?? 0
      return {
        kind: selectedKind,
        scripts: selectedScripts,
        observedKind: facts.observedKind,
        frames: values.length,
        emptyFrames: facts.emptyFrames,
        monotonic: facts.observedKind === 'fade' ? increasing : decreasing,
        range: facts.observedKind === 'fade' ? first < 0.2 && last > 0.8 : Math.abs(first) >= 99 && Math.abs(last) < 1,
        first,
        last,
        target: stage.querySelector('[data-active]')?.getAttribute('data-slide-id') ?? null,
        stableWindow: selectedScripts === 'refuse' ? Boolean(incomingWindow) && incomingFrame?.contentWindow === incomingWindow : null,
      }
    },
    { selectedKind: kind, selectedScripts: scripts },
  )
}

async function prepareTransition(
  h: Harness,
  kind: 'fade' | 'slide',
  scripts: 'refuse' | 'sandboxed',
  dir: 'ltr' | 'rtl',
  override?: { kind: 'fade' | 'slide'; duration: number },
) {
  await h.page.evaluate(
    async ({ selectedKind, selectedScripts, selectedDirection, hostOverride }) => {
      const host = (window as unknown as { __deckHost: TransitionHost }).__deckHost
      const stage = document.querySelector('#deck') as HTMLElement
      let neighborLoad: Promise<void> | null = null
      const observer = new MutationObserver((records) => {
        for (const node of records.flatMap((record) => [...record.addedNodes])) {
          if (!(node instanceof Element)) continue
          const frame = node.matches('[data-slide-id="transition-2"]')
            ? node.querySelector<HTMLIFrameElement>('iframe')
            : node.querySelector<HTMLIFrameElement>('[data-slide-id="transition-2"] iframe')
          if (frame) neighborLoad = new Promise((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))
        }
      })
      if (selectedScripts === 'refuse') observer.observe(stage, { childList: true, subtree: true })
      await host.loadTransition(selectedKind, selectedScripts, selectedDirection)
      await Promise.resolve()
      if (neighborLoad) await neighborLoad
      observer.disconnect()
      if (hostOverride) {
        host.stage.setAttribute('transition', hostOverride.kind)
        host.stage.setAttribute('transition-duration', String(hostOverride.duration))
      }
    },
    { selectedKind: kind, selectedScripts: scripts, selectedDirection: dir, hostOverride: override },
  )
}
