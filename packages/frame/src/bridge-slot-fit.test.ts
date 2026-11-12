import { describe, expect, test } from 'bun:test'
import { bridgeForHost, frameDocument, MESSAGE } from './bridge.ts'

function startSlotFitBridge(elements: unknown[], frames?: Array<() => void>, rootRects: () => unknown[] = () => [{}]) {
  const messages: unknown[] = []
  let ready = () => {}
  const settled = new Promise<void>((resolve) => {
    ready = resolve
  })
  const document = {
    addEventListener: () => {},
    fonts: null,
    images: [],
    readyState: 'complete',
    documentElement: { getBoundingClientRect: () => ({ height: 0 }), getClientRects: rootRects },
    getAnimations: () => [],
    querySelector: () => null,
    querySelectorAll: (selector: string) => (selector === '[data-slot-overflow]' ? elements : []),
  }
  const parent = {
    postMessage: (message: { type?: string }) => {
      messages.push(message)
      if (message.type === MESSAGE.ready) ready()
    },
  }
  const window = {
    addEventListener: () => {},
    getComputedStyle: (element: { style: { fontSize?: string } }) => ({ fontSize: element.style.fontSize ?? '16px' }),
    requestAnimationFrame: frames ? (callback: () => void) => frames.push(callback) : undefined,
  }
  Function(
    'document',
    'parent',
    'window',
    'MutationObserver',
    'setTimeout',
    'clearTimeout',
    bridgeForHost({ reportHeight: false }),
  )(
    document,
    parent,
    window,
    undefined,
    () => 1,
    () => {},
  )
  return { messages, settled }
}

function runSlotFitBridge(elements: unknown[], frames?: Array<() => void>): Promise<unknown[]> {
  const run = startSlotFitBridge(elements, frames)
  return run.settled.then(() => run.messages)
}

describe('slot fit bridge', () => {
  test('print documents measure slot overflow after the layout wait and before ready', () => {
    const html = frameDocument('<p>print</p>', { scripts: 'refuse', nonce: 'n', printAtMs: 0 })
    expect(html).toContain('var finishPrint=function(){freeze();slotFit(function(){')
    expect(html).toContain('.then(function(){settlePrint();})')
    expect(html).not.toContain('then(function(){slotFit();settlePrint();})')
    expect(html).toContain('if(element.getClientRects().length===0){unlaid=true;continue;}')
    expect(html).toContain('if(document.documentElement.getClientRects().length===0){wait();return;}')
    expect(html).toContain('if(unlaid&&slotFitTries<40)')
  })

  test('a laid-out inline refuse slot reports fit with zero client dimensions', async () => {
    const element = {
      clientWidth: 0,
      clientHeight: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      getClientRects: () => [{}],
      getAttribute: () => 'name:refuse',
      style: {},
    }
    const messages = await runSlotFitBridge([element])
    expect(messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'fit' } })
    expect(messages.at(-1)).toEqual({ type: MESSAGE.ready })
  })

  test('a retry retains a shrink element first measurement', async () => {
    const shrink = {
      clientWidth: 100,
      clientHeight: 20,
      get scrollWidth() {
        return Number.parseFloat(this.style.fontSize || '20') * 10
      },
      scrollHeight: 20,
      getClientRects: () => [{}],
      getAttribute: (name: string) => (name === 'data-slot-overflow' ? 'name:shrink:8' : null),
      style: { fontSize: '20px' },
    }
    let waiting = true
    const delayed = {
      clientWidth: 10,
      clientHeight: 10,
      scrollWidth: 10,
      scrollHeight: 10,
      getClientRects: () => (waiting ? [] : [{}]),
      getAttribute: (name: string) => (name === 'data-slot-overflow' ? 'role:refuse' : null),
      style: {},
    }
    const frames: Array<() => void> = []
    const pending = runSlotFitBridge([shrink, delayed], frames)
    for (let turn = 0; turn < 4 && frames.length === 0; turn++) await Promise.resolve()
    expect(frames).toHaveLength(1)
    waiting = false
    frames.shift()?.()
    const messages = await pending
    expect(messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'shrunk', role: 'fit' } })
  })

  test('a hidden document waits past the retry budget and posts once after layout appears', async () => {
    let visible = false
    const frames: Array<() => void> = []
    const element = {
      clientWidth: 10,
      clientHeight: 10,
      scrollWidth: 10,
      scrollHeight: 10,
      getClientRects: () => [{}],
      getAttribute: () => 'name:refuse',
      style: {},
    }
    const run = startSlotFitBridge([element], frames, () => (visible ? [{}] : []))
    for (let turn = 0; turn < 45; turn++) frames.shift()?.()
    expect(
      run.messages.filter((message) => {
        const type = (message as { type?: string }).type
        return type === MESSAGE.slotFit || type === MESSAGE.ready
      }),
    ).toEqual([])
    visible = true
    frames.shift()?.()
    await run.settled
    expect(run.messages.filter((message) => (message as { type?: string }).type === MESSAGE.slotFit)).toEqual([
      { type: MESSAGE.slotFit, slots: { name: 'fit' } },
    ])
  })

  test('a laid-out document reports unmeasured after the retry budget', async () => {
    const frames: Array<() => void> = []
    const element = { getClientRects: () => [], getAttribute: () => 'name:refuse', style: {} }
    const run = startSlotFitBridge([element], frames)
    for (let turn = 0; turn < 4 && frames.length < 2; turn++) await Promise.resolve()
    for (let turn = 0; turn < 100 && !run.messages.some((message) => (message as { type?: string }).type === MESSAGE.ready); turn++) frames.shift()?.()
    await run.settled
    expect(run.messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'unmeasured' } })
  })

  test('an unlaid duplicate does not override a measured state', async () => {
    const frames: Array<() => void> = []
    const measured = {
      clientWidth: 10,
      clientHeight: 10,
      scrollWidth: 10,
      scrollHeight: 10,
      getClientRects: () => [{}],
      getAttribute: () => 'name:refuse',
      style: {},
    }
    const unlaid = { getClientRects: () => [], getAttribute: () => 'name:refuse', style: {} }
    const run = startSlotFitBridge([measured, unlaid], frames)
    for (let turn = 0; turn < 4 && frames.length < 2; turn++) await Promise.resolve()
    for (let turn = 0; turn < 100 && !run.messages.some((message) => (message as { type?: string }).type === MESSAGE.ready); turn++) frames.shift()?.()
    await run.settled
    expect(run.messages).toContainEqual({ type: MESSAGE.slotFit, slots: { name: 'fit' } })
  })
})
