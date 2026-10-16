import type { PlayerProps, StageProps } from '@segnavia/react'

const player: PlayerProps = { rail: true, labels: { player: 'Player' } }
const stage: StageProps = { neighbors: true, fit: 'viewport' }

// @ts-expect-error `to` belongs to Step, not Player.
const wrongPlayer: PlayerProps = { to: 'next' }
// @ts-expect-error `rail` belongs to Player, not Stage.
const wrongStage: StageProps = { rail: true }

void [player, stage, wrongPlayer, wrongStage]
