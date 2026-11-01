import { describe, expect, test } from 'bun:test'
import { decideBookComposeFailure } from './book-element-support.ts'

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
