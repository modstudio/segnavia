import { expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import { COMPOSE_FAILURE_ATTRIBUTE, PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import type { LoadedLayoutScript } from '@segnavia/frame/layout'
import type { Page as Tab } from 'playwright-core'
import type { TabRunner } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import { PAGE_READY_BOUND_MS } from './renderer.ts'
import { renderSlideImage } from './slide-image.ts'

const deck = Deck.parse({
  title: 'Layout slide',
  size: { width: 400, height: 200 },
  slides: [{ id: 'one', content: { kind: 'html', html: '<p data-segnavia-layout="test">Layout</p>' } }],
})
const layoutScripts: LoadedLayoutScript[] = [{ name: 'test', script: 'DRAW', priority: 0, order: 0, selects: '[data-segnavia-layout~="test"]' }]
const established = { day: { date: '2026-11-14', zone: 'UTC', kind: 'current' as const }, slots: {} }
const deadline = { signal: new AbortController().signal, remaining: () => 10_000 }

function services(waitFor: (options: { timeout: number }) => Promise<void>, recorded: string | null, captured: () => void) {
  const frame = {
    locator(selector: string) {
      return {
        waitFor: (options: { timeout: number }) => {
          expect(selector).toBe(`html[${PRINT_READY_ATTRIBUTE}]`)
          return waitFor(options)
        },
        getAttribute: async (attribute: string) => {
          expect(attribute).toBe(COMPOSE_FAILURE_ATTRIBUTE)
          return recorded
        },
      }
    },
  }
  const tab = {
    locator: () => ({ contentFrame: () => frame }),
    screenshot: async () => {
      captured()
      return new Uint8Array([1, 2, 3])
    },
  } as unknown as Tab
  const withTab: TabRunner = async (_setup, body) => body(tab)
  return { withTab, layoutScripts: async () => layoutScripts }
}

test('slide image capture waits for its nested frame layout settlement', async () => {
  let settle = () => {}
  const waiting = new Promise<void>((resolve) => {
    settle = resolve
  })
  let firstEvent = () => {}
  const event = new Promise<void>((resolve) => {
    firstEvent = resolve
  })
  let waitStarted = false
  let captures = 0
  const rendering = renderSlideImage(
    deck,
    0,
    {} as never,
    services(
      () => {
        waitStarted = true
        firstEvent()
        return waiting
      },
      null,
      () => {
        captures++
        firstEvent()
      },
    ),
    deadline,
    established,
  )
  await event
  expect(waitStarted).toBe(true)
  expect(captures).toBe(0)
  settle()
  await expect(rendering).resolves.toEqual(new Uint8Array([1, 2, 3]))
  expect(captures).toBe(1)
})

test('slide image layout timeout refuses with the frame recorded failure', async () => {
  let timeout = 0
  const rendering = renderSlideImage(
    deck,
    0,
    {} as never,
    services(
      async (options) => {
        timeout = options.timeout
        throw new Error('timeout')
      },
      'layout broke',
      () => {},
    ),
    deadline,
    established,
  )
  await expect(rendering).rejects.toEqual(new RenderRefusedError('layout broke'))
  expect(timeout).toBe(PAGE_READY_BOUND_MS)
})
