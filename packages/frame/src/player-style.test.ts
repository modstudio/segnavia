import { expect, test } from 'bun:test'
import { COMPACT_PLAYER_WIDTH } from './player-layout.ts'
import { PLAYER_CSS } from './player-style.ts'

test('the player gives its stage and rail slide canvases a white backdrop by default', () => {
  expect(PLAYER_CSS).toContain('segnavia-stage,segnavia-rail{--_segnavia-shot-backdrop:var(--segnavia-shot-backdrop,#fff)}')
})

test('compact widths put host actions on one row at the bottom, below the rail', () => {
  expect(PLAYER_CSS).toContain(`@container (max-width:${COMPACT_PLAYER_WIDTH}px)`)
  expect(PLAYER_CSS).toContain('"start center end" "rail rail rail" "actions actions actions" "below below below"')
  expect(PLAYER_CSS).toContain('.actions slot[name="actions"]::slotted(*){flex:1 1 0;inline-size:auto;')
  expect(PLAYER_CSS).toContain(':host(:not([data-actions])) .actions{display:none}')
  expect(PLAYER_CSS).toContain('padding-inline-start:12px')
  expect(PLAYER_CSS).toContain('padding-inline-end:12px')
  expect(PLAYER_CSS).not.toContain('padding:0 0 12px 12px')
  expect(PLAYER_CSS).toContain('padding-block-end:var(--segnavia-bar-height,96px)')
})

test('the desk rail takes its size from the body row and compact restores content height', () => {
  expect(PLAYER_CSS).toContain(':host([rail]) segnavia-rail{display:block;contain:size;block-size:0;min-block-size:100%;overflow:hidden}')
  expect(PLAYER_CSS).toContain(
    ':host([rail]) segnavia-rail{border-inline-end:0;border-block-start:1px solid var(--_line);contain:none;block-size:auto;min-block-size:0;overflow:visible}',
  )
})
