import { expect, test } from 'bun:test'
import { PLAYER_CSS } from './player-style.ts'

test('the player gives its stage and rail slide canvases a white backdrop by default', () => {
  expect(PLAYER_CSS).toContain('segnavia-stage,segnavia-rail{--_segnavia-shot-backdrop:var(--segnavia-shot-backdrop,#fff)}')
})

test('compact widths put host actions on their own row under the transport', () => {
  expect(PLAYER_CSS).toContain('.control-row{grid-template-areas:"start center end" "actions actions actions";grid-template-rows:auto auto}')
  expect(PLAYER_CSS).toContain('.end{display:contents}')
  expect(PLAYER_CSS).toContain('.actions{display:flex;grid-area:actions;justify-content:end;')
  expect(PLAYER_CSS).toContain('.end-controls{display:flex;grid-area:end;justify-self:end;')
})
