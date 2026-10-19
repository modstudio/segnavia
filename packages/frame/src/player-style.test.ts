import { expect, test } from 'bun:test'
import { PLAYER_CSS } from './player-style.ts'

test('the player gives its stage and rail slide canvases a white backdrop by default', () => {
  expect(PLAYER_CSS).toContain('segnavia-stage,segnavia-rail{--_segnavia-shot-backdrop:var(--segnavia-shot-backdrop,#fff)}')
})

test('compact widths put host actions on one row at the bottom, below the rail', () => {
  expect(PLAYER_CSS).toContain('"start center end" "rail rail rail" "actions actions actions" "below below below"')
  expect(PLAYER_CSS).toContain('::slotted([slot="actions"]){flex:1 1 0;')
})
