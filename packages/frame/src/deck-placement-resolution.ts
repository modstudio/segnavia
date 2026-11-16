import type { AsOfDay, Deck, Slide } from '@segnavia/format'
import { classifyMediaAnswer, type PlacementsOptions, placementPlaceholderSource, refuseSoundsForPrint } from '@segnavia/html'

type MediaSlide = Extract<Slide['content'], { media: unknown }>
type ImageSlide = Extract<Slide['content'], { kind: 'image' }>

function missingMedia(content: MediaSlide): ImageSlide {
  return { kind: 'image', src: placementPlaceholderSource(), alt: content.media.alt?.text ?? '', fit: content.media.fit }
}

type MediaResolution<R extends { kind: string }> = { answer: R | undefined } | { error: unknown }

async function resolveMediaPlacement<R extends { kind: string }>(
  content: MediaSlide,
  placements: PlacementsOptions<R>,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
  day?: AsOfDay,
): Promise<MediaResolution<R>> {
  const placement = content.media
  try {
    const answer = await placements.resolve(placement, { purpose, width, signal, day })
    signal.throwIfAborted()
    return { answer }
  } catch (error) {
    if (signal.aborted) throw signal.reason
    return { error }
  }
}

function mediaContentFromResolution<R extends { kind: string }>(
  content: MediaSlide,
  placements: PlacementsOptions<R>,
  resolved: MediaResolution<R>,
): ImageSlide {
  const placement = content.media
  const classified = 'error' in resolved ? classifyMediaAnswer({ error: resolved.error }) : classifyMediaAnswer({ answer: resolved.answer })
  if (classified.status === 'ok') {
    return { kind: 'image', src: classified.value.src, alt: placement.alt?.text ?? classified.value.media.alt?.text ?? '', fit: placement.fit }
  }
  placements.report?.({
    address: placement.address,
    page: placement.page,
    reason: classified.status,
    ...(!('message' in classified) || classified.message === undefined ? {} : { message: classified.message }),
  })
  return missingMedia(content)
}

export async function resolveMediaContent<R extends { kind: string }>(
  content: MediaSlide,
  placements: PlacementsOptions<R> | undefined,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
  day?: AsOfDay,
): Promise<ImageSlide> {
  const placement = content.media
  if (!placements) return missingMedia(content)
  const resolved = await resolveMediaPlacement(content, placements, purpose, width, signal, day)
  refuseSoundsForPrint([{ placement: placement.address, answer: 'answer' in resolved ? resolved.answer : undefined }], purpose)
  return mediaContentFromResolution(content, placements, resolved)
}

export async function resolveDeckMedia<R extends { kind: string }>(
  deck: Deck,
  placements: PlacementsOptions<R> | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  day?: AsOfDay,
): Promise<Deck> {
  if (!placements)
    return { ...deck, slides: deck.slides.map((slide) => ('media' in slide.content ? { ...slide, content: missingMedia(slide.content) } : slide)) }
  const resolutions = await Promise.all(
    deck.slides.map(async (slide) =>
      'media' in slide.content ? resolveMediaPlacement(slide.content, placements, purpose, deck.size.width, signal, day) : undefined,
    ),
  )
  refuseSoundsForPrint(
    deck.slides.flatMap((slide, index) =>
      'media' in slide.content
        ? [{ placement: slide.content.media.address, answer: resolutions[index] && 'answer' in resolutions[index] ? resolutions[index].answer : undefined }]
        : [],
    ),
    purpose,
  )
  const slides = deck.slides.map((slide, index) => {
    if (!('media' in slide.content)) return slide
    const resolved = resolutions[index]
    if (!resolved) return { ...slide, content: missingMedia(slide.content) }
    return { ...slide, content: mediaContentFromResolution(slide.content, placements, resolved) }
  })
  return { ...deck, slides }
}
