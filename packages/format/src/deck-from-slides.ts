import type { Slide } from './deck.ts'
import type { DocumentInput } from './document.ts'
import { Document } from './document.ts'
import { deckFromDocument } from './document-lowering.ts'

type SlideFields = Omit<Slide, 'content'>
type ShotContent = Extract<Slide['content'], { kind: 'shot' }>

export type SlideRow = SlideFields & ({ kind: 'html'; html: string } | ShotContent)

export type DeckFromSlidesOptions = Pick<DocumentInput, 'title' | 'size' | 'layout' | 'fit' | 'frame' | 'transition' | 'playback' | 'captions' | 'style'> & {
  settings?: DocumentInput['settings']
  data?: DocumentInput['data']
  omitNotes?: boolean
}

const optionalPrintAt = (printAtMs: number | undefined) => (printAtMs === undefined ? {} : { printAtMs })

export function deckFromSlides(rows: SlideRow[], options: DeckFromSlidesOptions) {
  const { omitNotes = false, title, size, layout, fit, frame, transition, playback, captions, settings, style, data } = options
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
  const document = Document.parse({
    type: 'document',
    kind: 'deck',
    title,
    size,
    layout,
    fit,
    frame,
    transition,
    playback,
    captions,
    settings,
    style,
    data,
    children: slides.map((slide) => ({ type: 'slide' as const, ...slide })),
  })
  // Refuse a constructed Document that the current deck pipeline cannot play.
  deckFromDocument(document)
  return document
}
