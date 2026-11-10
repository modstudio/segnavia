import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'
import { decodePng } from './png-pixels.ts'

const STAGE = '#deck'

export interface LoadingBleedDifference {
  dir: 'ltr' | 'rtl'
  maxDifference: number
  differingPixels: number
  pixels: number
}

export async function captureLoadingBleed(h: Harness, dir: 'ltr' | 'rtl'): Promise<LoadingBleedDifference> {
  await h.page.goto(h.url('deck-host.html'))
  await h.page.waitForFunction(() => Boolean((window as unknown as { __deckHost?: unknown }).__deckHost))
  await h.page.evaluate(async (direction) => {
    const host = (window as unknown as { __deckHost: { loadBleed(dir: 'ltr' | 'rtl'): Promise<void> } }).__deckHost
    await host.loadBleed(direction)
  }, dir)
  await h.page.frameLocator('#deck [data-active][data-slide-id="bleed-active"] iframe').locator('span').waitFor()
  await h.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const stage = h.page.locator(STAGE)
  const reference = decodePng(new Uint8Array(await stage.screenshot({ type: 'png' })))
  await h.page.evaluate((direction) => {
    const host = (window as unknown as { __deckHost: { startBleed(dir: 'ltr' | 'rtl'): Promise<void> } }).__deckHost
    void host.startBleed(direction)
  }, dir)
  await h.page.waitForFunction(() => document.querySelector('#deck [data-incoming][data-slide-id="bleed-loading"] iframe'))
  await h.page.frameLocator('#deck [data-incoming][data-slide-id="bleed-loading"] iframe').locator('body').waitFor()
  const loading = decodePng(new Uint8Array(await stage.screenshot({ type: 'png' })))
  h.releaseHeldFrames()
  if (reference.width !== loading.width || reference.height !== loading.height) {
    throw new Error(`The loading comparison changed size from ${reference.width}x${reference.height} to ${loading.width}x${loading.height}.`)
  }
  let maxDifference = 0
  let differingPixels = 0
  for (let offset = 0; offset < reference.pixels.length; offset += 3) {
    let differs = false
    for (let channel = 0; channel < 3; channel++) {
      const difference = Math.abs((reference.pixels[offset + channel] ?? 0) - (loading.pixels[offset + channel] ?? 0))
      maxDifference = Math.max(maxDifference, difference)
      differs ||= difference > 0
    }
    if (differs) differingPixels++
  }
  return { dir, maxDifference, differingPixels, pixels: reference.width * reference.height }
}

interface SampledTurns {
  frames: number
  badFrames: number
  turns: number
  cancelled: boolean
  target: string | null
  timedOut: boolean
}

export async function sampleSandboxedTurns(h: Harness): Promise<SampledTurns> {
  return h.page.evaluate(async (boundedWaitMs) => {
    const stage = document.querySelector('#deck') as HTMLElement & { controller: { go(index: number): Promise<void> } }
    const deadline = performance.now() + boundedWaitMs
    const loaded = new WeakSet<Element>()
    const watch = (canvas: Element) => {
      const media = canvas.querySelector('iframe, img')
      if (media) media.addEventListener('load', () => loaded.add(media), { once: true })
    }
    const activeMedia = stage.querySelector('[data-active] iframe, [data-active] img')
    if (activeMedia) loaded.add(activeMedia)
    const observer = new MutationObserver((records) => {
      const added = records.flatMap((record) => [...record.addedNodes]).filter((node): node is Element => node instanceof Element)
      for (const node of added) {
        if (node.matches('.segnavia-stage__canvas')) watch(node)
        for (const canvas of node.querySelectorAll('.segnavia-stage__canvas')) watch(canvas)
      }
    })
    observer.observe(stage, { childList: true, subtree: true })

    let frames = 0
    let badFrames = 0
    let sampling = true
    const sample = () => {
      if (!sampling) return
      frames++
      const visible = [...stage.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')].filter((canvas) => {
        const style = getComputedStyle(canvas)
        return style.opacity === '1' && style.display !== 'none' && style.visibility !== 'hidden' && !canvas.hidden
      })
      const media = visible[0]?.querySelector('iframe, img')
      if (visible.length !== 1 || !media || !loaded.has(media)) badFrames++
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const waitForActive = (id: string) =>
      new Promise<boolean>((resolve) => {
        const poll = () => {
          if (stage.querySelector('[data-active]')?.getAttribute('data-slide-id') === id) resolve(true)
          else if (performance.now() >= deadline) resolve(false)
          else requestAnimationFrame(poll)
        }
        poll()
      })
    const waitWithinBound = (promise: Promise<void>) => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) return Promise.resolve(false)
      return Promise.race([promise.then(() => true), new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), remaining))])
    }
    const go = async (index: number) => {
      if (!(await waitWithinBound(stage.controller.go(index)))) return false
      if (!(await waitForActive(`sandboxed-${index + 1}`))) return false
      return waitWithinBound(settle())
    }
    let completed = true
    for (const index of [1, 2, 1, 0, 1]) {
      completed = await go(index)
      if (!completed) break
    }
    if (completed) completed = await waitWithinBound(stage.controller.go(2))
    const firstIncoming = completed ? stage.querySelector<HTMLElement>('[data-slide-id="sandboxed-3"]') : null
    if (completed) completed = await waitWithinBound(stage.controller.go(0))
    if (completed) completed = await waitForActive('sandboxed-1')
    if (completed) completed = await waitWithinBound(settle())
    sampling = false
    observer.disconnect()
    const active = stage.querySelector<HTMLElement>('[data-active]')
    return {
      frames,
      badFrames,
      turns: 7,
      cancelled: Boolean(firstIncoming) && !firstIncoming?.isConnected && !stage.querySelector('[data-slide-id="sandboxed-3"]'),
      target: active?.dataset.slideId ?? null,
      timedOut: !completed,
    }
  }, BOUNDED_WAIT_MS)
}
