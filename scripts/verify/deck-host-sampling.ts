import { inflateSync } from 'node:zlib'
import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

const STAGE = '#deck'

export async function captureSandboxedTurns(h: Harness, durations: number[], pixels: Array<[number, number, number]>) {
  for (const [index, id] of [
    [1, 'sandboxed-2'],
    [2, 'sandboxed-3'],
  ] as const) {
    const started = performance.now()
    await h.page.evaluate((target) => {
      const host = (window as unknown as { __deckHost: { controller: { go(index: number): Promise<void> } } }).__deckHost
      void host.controller.go(target)
    }, index)
    let active = ''
    while (active !== id) {
      pixels.push(await stageCenterPixel(h))
      active = (await h.page.locator(`${STAGE} [data-active]`).getAttribute('data-slide-id')) ?? ''
    }
    durations.push(performance.now() - started)
    pixels.push(await stageCenterPixel(h), await stageCenterPixel(h))
  }
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

async function stageCenterPixel(h: Harness): Promise<[number, number, number]> {
  const box = await h.page.locator(STAGE).boundingBox()
  if (!box) throw new Error('The deck stage has no box.')
  return screenshotPixel(await h.page.screenshot({ clip: { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 1, height: 1 } }))
}

function screenshotPixel(png: Uint8Array): [number, number, number] {
  let offset = 8
  const compressed: Uint8Array[] = []
  while (offset < png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0)
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8))
    if (type === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const row = inflateSync(Buffer.concat(compressed))
  return [row[1] ?? 0, row[2] ?? 0, row[3] ?? 0]
}
