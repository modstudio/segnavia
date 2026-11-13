import { expect, test } from 'bun:test'
import { boundPreflightReport, Page, PREFLIGHT_PRESETS } from '@segnavia/format'
import { MESSAGE } from './bridge.ts'
import { installDocumentPagePreflight } from './document-page-preflight.ts'
import { fitPageFrame } from './page-element-layout.ts'
import { handlePageFrameMessage, type PageFrameMessageState } from './page-frame-message.ts'
import { SurfacePreflightCoordinator } from './surface-preflight.ts'

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

test('a plain mounted document page advances document preflight coverage', () => {
  const current = frame()
  const pageElement = new EventTarget() as HTMLElement
  const documentElement = new EventTarget()
  const documentPreflight = new SurfacePreflightCoordinator<number>(documentElement)
  documentPreflight.setSurface([{ key: 0, folio: '1', kind: 'page' }], false)
  installDocumentPagePreflight(pageElement, (report) => documentPreflight.receive(0, report))
  let received: import('@segnavia/format').PreflightReport | undefined
  documentElement.addEventListener('preflight', (event) => {
    received = (event as CustomEvent<import('@segnavia/format').PreflightReport>).detail
  })
  const state: PageFrameMessageState = {
    composedFrame: undefined,
    currentFrame: { frame: current, generation: 1 },
    documentIsFinal: true,
    documentIsLoaded: true,
    frameHeight: { contentHeight: 0, hasReport: false, ownsElementHeight: false },
    frameReady: true,
    page: Page.parse({ html: '<p>Page</p>' }),
    profile: PREFLIGHT_PRESETS.default,
    resolvedSlots: undefined,
    slotFrame: undefined,
    fit: () => {},
    ready: () => {},
  }
  const report = boundPreflightReport(
    { entries: [{ check: 'slot-overset', subject: 'name', message: 'Name is overset.' }], facts: { pageCount: 1, pages: [], fits: [] } },
    PREFLIGHT_PRESETS.default,
  )

  handlePageFrameMessage(pageElement, { source: current.contentWindow, data: { type: MESSAGE.preflight, report } } as MessageEvent, state)

  expect(received).toMatchObject({ coverage: { measured: 1, total: 1 } })
  expect(received?.issues[0]).toMatchObject({ subject: 'name', location: { folio: '1' } })
})

test('a plain frame with layout scripts dispatches only bounded compose failures', () => {
  const current = frame()
  const pageElement = new EventTarget() as HTMLElement
  const errors: ErrorEvent[] = []
  pageElement.addEventListener('error', (event) => errors.push(event as ErrorEvent))
  const state: PageFrameMessageState = {
    composedFrame: undefined,
    currentFrame: { frame: current, generation: 3 },
    documentIsFinal: true,
    documentIsLoaded: true,
    frameHeight: { contentHeight: 0, hasReport: false, ownsElementHeight: false },
    frameReady: false,
    layoutFrame: { frame: current, generation: 3 },
    page: Page.parse({ html: '<p data-segnavia-layout="margin">Page</p>' }),
    profile: PREFLIGHT_PRESETS.default,
    resolvedSlots: undefined,
    slotFrame: undefined,
    fit: () => {},
    ready: () => {},
  }
  const text = 'x'.repeat(1024)
  handlePageFrameMessage(pageElement, { source: current.contentWindow, data: { type: MESSAGE.composeFailure, text } } as MessageEvent, state)
  handlePageFrameMessage(pageElement, { source: current.contentWindow, data: { type: MESSAGE.composeFailure, text: `${text}x` } } as MessageEvent, state)
  expect(errors.map((event) => event.message)).toEqual([text])
})
