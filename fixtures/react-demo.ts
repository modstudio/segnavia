import type { SegnaviaPlayer } from '@segnavia/frame/player'
import { Player, useAuthoring, useDeckController } from '@segnavia/react'
import { createElement, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

const facts = { changes: 0, saves: [] as string[], notesRoots: [] as number[] }

function App() {
  const [rail, setRail] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [playerKey, setPlayerKey] = useState(0)
  const [player, setPlayer] = useState<SegnaviaPlayer | null>(null)
  const deckController = useDeckController(player)
  const authoring = useAuthoring(
    player,
    {
      saveNotes: async ({ notes }) => {
        facts.saves.push(notes)
      },
      moveSlide: configured ? async () => {} : undefined,
    },
    { notesMaxLength: configured ? 1234 : 20_000 },
  )
  useEffect(() => {
    if (player) facts.notesRoots.push(player.shadowRoot?.querySelectorAll('[data-authoring-notes]').length ?? 0)
    Object.assign(window, {
      reactSetRail: setRail,
      reactConfigureAuthoring: () => setConfigured(true),
      reactMount: () => setMounted(true),
      reactReplace: () => setPlayerKey((value) => value + 1),
      reactPlayer: player,
      reactAuthoring: authoring,
      reactDeckController: deckController,
    })
  }, [authoring, deckController, player])
  if (!mounted) return null
  return createElement(Player, {
    key: playerKey,
    ref: setPlayer,
    src: 'deck.json',
    fit: 'height',
    rail,
    labels: { player: 'React player' },
    onClick: () => facts.changes++,
  })
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(createElement(StrictMode, null, createElement(App)))
Object.assign(window, { reactFacts: facts, reactUnmount: () => root.unmount() })
