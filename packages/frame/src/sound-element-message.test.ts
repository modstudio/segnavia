import { expect, test } from 'bun:test'
import type { SoundPlacements } from '@segnavia/html'
import { MESSAGE } from './bridge.ts'
import { handlePageElementMessage } from './page-message-handler.ts'
import { handleStageMessage } from './stage-message.ts'

const sound = { format: 'mp3' as const, durationMs: 1_000 }
const sounds: SoundPlacements = new Map([['0', { sound, src: 'theme.mp3' }]])

function received(target: EventTarget): CustomEvent[] {
  const events: CustomEvent[] = []
  target.addEventListener('segnavia-sound-play', (event) => events.push(event as CustomEvent))
  return events
}

test('stage message handling resolves only a handle from its own frame', () => {
  const source = {}
  const other = {}
  const frame = { contentWindow: source } as HTMLIFrameElement
  const target = new EventTarget()
  const events = received(target)
  const pool = {
    frames: () => [frame],
    markReady() {},
    activeFrame: () => frame,
    slideIdFor: (candidate: MessageEventSource | null) => (candidate === source ? 'slide' : undefined),
    contentFor: (candidate: MessageEventSource | null) => (candidate === source ? { kind: 'html' as const, html: '', sounds } : undefined),
  }
  const send = (eventSource: object, placement: string) =>
    handleStageMessage(
      target as HTMLElement,
      pool,
      undefined,
      null,
      () => {},
      () => {},
      { source: eventSource, data: { type: MESSAGE.soundPlay, placement } } as MessageEvent,
    )

  send(source, '0')
  send(source, 'missing')
  send(other, '0')
  expect(events).toHaveLength(1)
  expect(events[0]?.detail).toEqual({ sound, src: 'theme.mp3', placement: '0' })
  expect(events[0]).toMatchObject({ bubbles: true, composed: true, cancelable: true })
})

test('page message handling resolves only a handle from its own frame', () => {
  const source = {}
  const other = {}
  const frame = { contentWindow: source } as HTMLIFrameElement
  const host = Object.assign(new EventTarget(), {
    loadGeneration: 1,
    composedFrame: undefined,
    documentWrites: 0,
    frameHeight: { contentHeight: 0, hasReport: false, ownsElementHeight: false },
    frameReady: false,
    pageValue: null,
    profileInput: 'default' as const,
    pageRequests: { pending: new Set(), posted: new Set(), ready: new Set() },
    fit() {},
    querySelector: () => frame,
  })
  const events = received(host)
  const fields = {
    resolvedSlots: undefined,
    slotFrame: undefined,
    layoutFrame: undefined,
    loadedDocument: undefined,
    sounds,
    documentIsFinal: false,
  }
  const send = (eventSource: object, placement: string) =>
    handlePageElementMessage(host, { source: eventSource, data: { type: MESSAGE.soundPlay, placement } } as MessageEvent, fields)

  send(source, '0')
  send(source, 'missing')
  send(other, '0')
  expect(events).toHaveLength(1)
  expect(events[0]?.detail).toEqual({ sound, src: 'theme.mp3', placement: '0' })
  expect(events[0]).toMatchObject({ bubbles: true, composed: true, cancelable: true })
})
