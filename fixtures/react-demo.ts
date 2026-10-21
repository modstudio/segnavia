import type { SegnaviaPaper } from '@segnavia/frame'
import type { SegnaviaPlayer } from '@segnavia/frame/player'
import { Page, Document as PageDocument, Paper, PaperPicker, Player, Thumbnail, useAuthoring, useDeckController } from '@segnavia/react'
import { createElement, Fragment, StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

let releaseReplacementSave = () => {}
const replacementSave = new Promise<void>((resolve) => (releaseReplacementSave = resolve))
window.addEventListener('react-release-replacement', releaseReplacementSave, {
  once: true,
})
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

const wrapperPage = {
  html: '<html style="background:#def"><body><p>React page</p></body></html>',
}
const wrapperPrint = {
  paper: 'business-card-square-us' as const,
  orientation: 'portrait' as const,
}

function PageWrappers() {
  const paper = useRef<SegnaviaPaper | null>(null)
  const [objects, setObjects] = useState(0)
  useEffect(
    () =>
      paper.current?.load([wrapperPage], {
        ...wrapperPrint,
        columns: 1,
        rows: 1,
        cell: { width: 63.5, height: 63.5 },
        unit: 'mm',
      }),
    [],
  )
  useEffect(() => {
    Object.assign(window, { reactSetWrapperObjects: setObjects })
  }, [])
  const page =
    objects === 1
      ? undefined
      : {
          ...wrapperPage,
          html: `${wrapperPage.html}<!-- ${objects} -->`,
          size: { width: 240, height: 240 } as const,
        }
  const pages = objects === 1 ? undefined : [{ ...wrapperPage, html: `${wrapperPage.html}<!-- ${objects} -->` }]
  const print = objects === 1 ? undefined : { ...wrapperPrint }
  return createElement(
    Fragment,
    null,
    createElement(Page, { id: 'react-page', page }),
    createElement(Thumbnail, { id: 'react-thumbnail', page, print }),
    createElement(Paper, { id: 'react-paper', ref: paper }),
    createElement(PageDocument, { id: 'react-document', pages, print }),
  )
}

function App() {
  const [rail, setRail] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [playerKey, setPlayerKey] = useState(0)
  const [authoringKey, setAuthoringKey] = useState(0)
  const [paperPickerProps, setPaperPickerProps] = useState(true)
  const [player, setPlayer] = useState<SegnaviaPlayer | null>(null)
  const deckController = useDeckController(player)
  useEffect(() => {
    Object.assign(window, {
      reactSetRail: setRail,
      reactConfigureAuthoring: () => setConfigured(true),
      reactMount: () => setMounted(true),
      reactReplaceAuthoring: () => setAuthoringKey((value) => value + 1),
      reactReplace: () => setPlayerKey((value) => value + 1),
      reactUnsetPaperPicker: () => setPaperPickerProps(false),
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
    createElement(
      PaperPicker,
      paperPickerProps
        ? {
            value: { paper: 'letter', orientation: 'landscape' },
            labels: { paper: 'Stock' },
          }
        : {},
    ),
    createElement(PageWrappers),
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(createElement(StrictMode, null, createElement(App)))
Object.assign(window, { reactFacts: facts, reactUnmount: () => root.unmount() })
