// The finished player's entry point: defines <segnavia-player>, the styled
// components it is made of, and the headless elements beneath them.

import './controls-entry.ts'
import { SegnaviaPlayer } from './player.ts'
import { STYLED_ELEMENTS } from './styled-elements.ts'

export * from './controls-entry.ts'
export { SegnaviaPlayer } from './player.ts'

if (!customElements.get(STYLED_ELEMENTS.player)) customElements.define(STYLED_ELEMENTS.player, SegnaviaPlayer)
