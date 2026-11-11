import { expect, test } from 'bun:test'
import { Page, PREFLIGHT_PRESETS } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import { fitPageFrame } from './page-element-layout.ts'
import { handlePageFrameMessage, type PageFrameMessageState } from './page-frame-message.ts'

const printed = Page.parse({
  html: '<p>Paper</p>',
  print: { paper: 'letter' },
  printedPages: { parents: [{ name: 'body' }], parentRules: [{ parent: 'body' }] },
})

function frame() {
  return { contentWindow: {} } as HTMLIFrameElement
}

function sendHeight(target: HTMLElement, state: PageFrameMessageState, height: number): void {
  handlePageFrameMessage(target, { source: state.currentFrame.frame?.contentWindow, data: { type: MESSAGE.height, height } } as MessageEvent, state)
}

test('only the current composed frame can set a printed page height', () => {
  const current = frame()
  const style = {
    height: '',
    transform: '',
    removeProperty(name: string) {
      if (name === 'height') this.height = ''
      if (name === 'transform') this.transform = ''
    },
  }
  const target = Object.assign(new EventTarget(), { dataset: {}, style }) as unknown as HTMLElement
  const sheet = { style: { ...style } } as unknown as HTMLElement
  let fits = 0
  const state: PageFrameMessageState = {
    composedFrame: { frame: current, generation: 1 },
    currentFrame: { frame: current, generation: 2 },
    documentIsFinal: true,
    documentIsLoaded: true,
    frameHeight: { contentHeight: 0, hasReport: false, ownsElementHeight: false },
    frameReady: false,
    page: printed,
    profile: PREFLIGHT_PRESETS.default,
    resolvedSlots: undefined,
    slotFrame: undefined,
    fit: () => {
      fits++
      fitPageFrame(target, printed, sheet, state.frameHeight, false)
    },
    ready: () => {},
  }

  sendHeight(target, state, 400)
  expect(state.frameHeight).toMatchObject({ contentHeight: 0, hasReport: false })
  expect(target.dataset.height).toBeUndefined()
  expect(fits).toBe(0)

  state.composedFrame = state.currentFrame
  sendHeight(target, state, 640)
  expect(state.frameHeight).toMatchObject({ contentHeight: 640, hasReport: true })
  expect(target.dataset.height).toBe('640')
  expect(target.dataset.measured).toBe('')
  expect(fits).toBe(1)
})
