import type { PlayerProps, StageProps } from '@segnavia/react'
import type * as React from 'react'

const player: PlayerProps = { rail: true, labels: { player: 'Player' } }
const stage: StageProps = { neighbors: true, fit: 'viewport' }

// @ts-expect-error `to` belongs to Step, not Player.
const wrongPlayer: PlayerProps = { to: 'next' }
// @ts-expect-error `rail` belongs to Player, not Stage.
const wrongStage: StageProps = { rail: true }

const playerFromIntrinsic: PlayerProps = {} as React.JSX.IntrinsicElements['segnavia-player']
const intrinsicFromPlayer: React.JSX.IntrinsicElements['segnavia-player'] = {} as PlayerProps
// @ts-expect-error `to` belongs to Step, not Player.
const wrongIntrinsic: React.JSX.IntrinsicElements['segnavia-player'] = { to: 'next' }

function OverlayHeader({ title, titleAs: TitleTag = 'h2' }: { title?: React.ReactNode; titleAs?: React.ElementType }) {
  return <TitleTag className="text-base">{title}</TitleTag>
}

// @ts-expect-error unknown custom element is not a Segnavia intrinsic.
const unknown = <segnavia-nope />

void [player, stage, wrongPlayer, wrongStage, playerFromIntrinsic, intrinsicFromPlayer, wrongIntrinsic, OverlayHeader, unknown]
