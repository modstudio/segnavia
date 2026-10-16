import { expect, test } from 'bun:test'
import { PLAYER_CSS } from './player-style.ts'

test('the player gives its stage and rail slide canvases a white backdrop by default', () => {
  expect(PLAYER_CSS).toContain('segnavia-stage,segnavia-rail{--_segnavia-shot-backdrop:var(--segnavia-shot-backdrop,#fff)}')
})
