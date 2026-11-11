import { describe, expect, test } from 'bun:test'
import { decideBookComposeFailure, reportBookError } from './book-element-support.ts'

test('book errors use the native ErrorEvent contract', () => {
  const target = new EventTarget()
  let received: ErrorEvent | undefined
  target.addEventListener('error', (event) => {
    received = event as ErrorEvent
  })

  reportBookError(target as HTMLElement, 'composition refused')

  expect(received).toBeInstanceOf(ErrorEvent)
  expect(received?.message).toBe('composition refused')
  expect(received?.error).toBeInstanceOf(Error)
  expect(received?.error.message).toBe('composition refused')
  expect(received?.bubbles).toBeTrue()
  expect(received?.composed).toBeTrue()
})

describe('book composition failure decision', () => {
  test('chooses the fallback and handoff transition from plain state', () => {
    expect(decideBookComposeFailure({ type: 'segnavia:compose-failure', text: 'refused' }, 'flow', false, 'pages', 'flow')).toEqual({
      action: 'fail',
      text: 'refused',
      fallback: 'pages',
      cancelHandoff: true,
    })
    expect(decideBookComposeFailure({ type: 'segnavia:compose-failure', text: 'again' }, 'flow', true, undefined, undefined)).toEqual({
      action: 'handled',
    })
    expect(decideBookComposeFailure({ type: 'segnavia:ready' }, 'flow', false, undefined, undefined)).toEqual({ action: 'ignore' })
  })
})
