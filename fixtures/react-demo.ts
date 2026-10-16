import type { SegnaviaPlayer } from '@segnavia/frame/player'
import { Player, useAuthoring, useDeckController } from '@segnavia/react'
import { createElement, Fragment, StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

let releaseReplacementSave = () => {}
const replacementSave = new Promise<void>((resolve) => (releaseReplacementSave = resolve))
window.addEventListener('react-release-replacement', releaseReplacementSave, { once: true })
const facts = { changes: 0, saves: [] as string[], notesRoots: [] as number[] }

function Authoring({ player, configured }: { player: SegnaviaPlayer | null; configured: boolean }) {
  const authoring = useAuthoring(
    player,
    {
      saveNotes: async ({ notes }) => {
        facts.saves.push(notes)
        if (notes === 'Strict replacement draft') await replacementSave
      },
      moveSlide: configured ? async () => {} : undefined,
    },
    { notesMaxLength: configured ? 1234 : 20_000 },
  )
  useEffect(() => {
    if (!player || !authoring) return
    facts.notesRoots.push(player.shadowRoot?.querySelectorAll('[data-authoring-notes]').length ?? 0)
    Object.assign(window, { reactAuthoring: authoring })
  }, [authoring, player])
  return null
}

function App() {
  const [rail, setRail] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [playerKey, setPlayerKey] = useState(0)
  const [authoringKey, setAuthoringKey] = useState(0)
  const [player, setPlayer] = useState<SegnaviaPlayer | null>(null)
  const deckController = useDeckController(player)
  useEffect(() => {
    Object.assign(window, {
      reactSetRail: setRail,
      reactConfigureAuthoring: () => setConfigured(true),
      reactMount: () => setMounted(true),
      reactReplaceAuthoring: () => setAuthoringKey((value) => value + 1),
      reactReplace: () => setPlayerKey((value) => value + 1),
      reactPlayer: player,
      reactDeckController: deckController,
    })
  }, [deckController, player])
  if (!mounted) return null
  return createElement(
    Fragment,
    null,
    createElement(Player, {
      key: playerKey,
      ref: setPlayer,
      src: 'deck.json',
      fit: 'height',
      rail,
      labels: { player: 'React player' },
      onClick: () => facts.changes++,
    }),
    createElement(Authoring, { key: authoringKey, player, configured }),
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(createElement(StrictMode, null, createElement(App)))
Object.assign(window, { reactFacts: facts, reactUnmount: () => root.unmount() })
