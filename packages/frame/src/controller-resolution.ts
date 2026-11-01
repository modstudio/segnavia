import { PublishedShot, type Slide } from '@segnavia/format'
import { placementPlaceholderSource, safeImageSource } from '@segnavia/html'
import { assertValidCues } from './controller-cues.ts'
import { referenceOverrides, resolvedPublishedShot } from './controller-options.ts'
import type { ControllerOptions, ResolvedContent } from './controller-types.ts'

type MediaSlide = Extract<Slide['content'], { media: unknown }>

function missingMedia(content: MediaSlide): ResolvedContent {
  return { kind: 'image', src: placementPlaceholderSource(), alt: content.media.alt?.text ?? '', fit: content.media.fit }
}

async function resolveMedia(content: MediaSlide, placements: ControllerOptions['placements'], width: number): Promise<ResolvedContent> {
  const placement = content.media
  if (!placements) return missingMedia(content)
  try {
    const resolved = await placements.resolve(placement, { purpose: 'screen', width, signal: new AbortController().signal })
    if (!resolved) {
      placements.report?.({ address: placement.address, page: placement.page, reason: 'missing' })
      return missingMedia(content)
    }
    if (resolved.kind !== 'media') {
      placements.report?.({ address: placement.address, page: placement.page, reason: 'invalid', message: `resolved ${resolved.kind}, not media` })
      return missingMedia(content)
    }
    if (!safeImageSource(resolved.src)) {
      placements.report?.({ address: placement.address, page: placement.page, reason: 'refused-src' })
      return missingMedia(content)
    }
    return { kind: 'image', src: resolved.src, alt: placement.alt?.text ?? resolved.media.alt?.text ?? '', fit: placement.fit }
  } catch (error) {
    placements.report?.({ address: placement.address, page: placement.page, reason: 'failed', message: error instanceof Error ? error.message : String(error) })
    return missingMedia(content)
  }
}

export async function resolveFreshContent(
  slide: Slide,
  index: number,
  resolveSlide: ControllerOptions['resolveSlide'],
  resolveUrl: (path: string) => string,
  shots: Map<string, Promise<PublishedShot>>,
  placements: ControllerOptions['placements'],
  width: number,
): Promise<ResolvedContent> {
  const content = resolveSlide ? await resolveSlide(slide, index) : slide.content
  if ('media' in content) return resolveMedia(content, placements, width)
  if (content.kind === 'shot') {
    assertValidCues(slide, content.shot.annotations.length)
    if (!('kind' in slide.content) || slide.content.kind !== 'shot-ref') return content
    return referenceOverrides(content, slide.content)
  }
  if (content.kind !== 'shot-ref') return content
  const href = resolveUrl(content.href)
  let published = shots.get(href)
  if (!published) {
    published = fetch(href).then(async (response) => {
      if (!response.ok) throw new Error(`The shot at ${href} answered ${response.status}.`)
      return PublishedShot.parse(await response.json())
    })
    shots.set(href, published)
  }
  const { src, shot } = await published
  assertValidCues(slide, shot.annotations.length)
  return resolvedPublishedShot(new URL(src, href).href, shot, content)
}
