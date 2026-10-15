import type { DeckController } from '@segnavia/frame'
import { Player, useAuthoring } from '@segnavia/react'
import { createElement, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

const facts = { changes: 0 }

function App() {
  const [rail, setRail] = useState(false)
  const player = useRef<HTMLElement & { controller: DeckController }>(null)
  const authoring = useAuthoring(player as never, { saveNotes: async () => {} })
  useEffect(() => {
    Object.assign(window, { reactSetRail: setRail, reactPlayer: player.current, reactAuthoring: authoring })
  }, [authoring])
  return createElement(Player, {
    ref: player,
    src: 'deck.json',
    rail,
    labels: { player: 'React player' },
    onClick: () => facts.changes++,
  })
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(createElement(App))
Object.assign(window, { reactFacts: facts, reactUnmount: () => root.unmount() })
