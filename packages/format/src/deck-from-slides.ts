import type { Slide } from './deck.ts'
import type { DocumentInput } from './document.ts'
import { Document } from './document.ts'
import { deckFromDocument } from './document-lowering.ts'

type SlideFields = Omit<Slide, 'content'>
type ShotContent = Extract<Slide['content'], { kind: 'shot' }>

export type SlideRow = SlideFields & ({ kind: 'html'; html: string } | ShotContent)

export type DeckFromSlidesOptions = Pick<
  DocumentInput,
  'title' | 'size' | 'layout' | 'fit' | 'frame' | 'transition' | 'playback' | 'captions' | 'readingSpeed' | 'style'
> & {
  settings?: DocumentInput['settings']
  data?: DocumentInput['data']
  omitNotes?: boolean
}

export function deckFromSlides(rows: SlideRow[], options: DeckFromSlidesOptions) {
  const { omitNotes = false, title, size, layout, fit, frame, transition, playback, captions, readingSpeed, settings, style, data } = options
  const slides = rows.map((row) => {
    if (row.kind === 'html') {
      const { kind, html, notes, ...slide } = row
      return { ...slide, ...(!omitNotes && notes !== undefined ? { notes } : {}), content: { kind, html } }
    }

    const { kind, src, shot, fit, frame, notes, ...slide } = row
    return {
      ...slide,
      ...(!omitNotes && notes !== undefined ? { notes } : {}),
      content: {
        kind,
        src,
        shot,
        ...(fit !== undefined ? { fit } : {}),
        ...(frame !== undefined ? { frame } : {}),
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
    readingSpeed,
    settings,
    style,
    data,
    children: slides.map((slide) => ({ type: 'slide' as const, ...slide })),
  })
  // Refuse a constructed Document that the current deck pipeline cannot play.
  deckFromDocument(document)
  return document
}
