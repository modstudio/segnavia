import { Deck, type DeckInput } from './deck.ts'

type SlideInput = DeckInput['slides'][number]
type SlideFields = Omit<SlideInput, 'content'>
type ShotContent = Extract<SlideInput['content'], { kind: 'shot' }>

export type SlideRow = SlideFields & ({ kind: 'html'; html: string } | ShotContent)

export type DeckFromSlidesOptions = Omit<DeckInput, 'slides'> & {
  omitNotes?: boolean
}

const optionalPrintAt = (printAtMs: number | undefined) => (printAtMs === undefined ? {} : { printAtMs })

export function deckFromSlides(rows: SlideRow[], options: DeckFromSlidesOptions) {
  const { omitNotes = false, ...deckOptions } = options
  const slides = rows.map(({ kind, ...row }) => {
    const { id, notes, narration, beforeMs, afterMs, holdMs, printAtMs } = row
    const common = {
      id,
      ...(!omitNotes && notes !== undefined ? { notes } : {}),
      ...(narration !== undefined ? { narration } : {}),
      ...(beforeMs !== undefined ? { beforeMs } : {}),
      ...(afterMs !== undefined ? { afterMs } : {}),
      ...(holdMs !== undefined ? { holdMs } : {}),
      ...optionalPrintAt(printAtMs),
    }
    return kind === 'html'
      ? { ...common, content: { kind, html: (row as Extract<SlideRow, { kind: 'html' }>).html } }
      : {
          ...common,
          content: {
            kind,
            src: (row as Extract<SlideRow, { kind: 'shot' }>).src,
            shot: (row as Extract<SlideRow, { kind: 'shot' }>).shot,
            ...((row as Extract<SlideRow, { kind: 'shot' }>).fit !== undefined ? { fit: (row as Extract<SlideRow, { kind: 'shot' }>).fit } : {}),
            ...((row as Extract<SlideRow, { kind: 'shot' }>).frame !== undefined ? { frame: (row as Extract<SlideRow, { kind: 'shot' }>).frame } : {}),
          },
        }
  })
  return Deck.parse({ ...deckOptions, slides })
}
