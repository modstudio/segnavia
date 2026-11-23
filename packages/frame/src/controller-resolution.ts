import { PublishedShot, type Slide } from '@segnavia/format'
import { resolvePlacementsWithSounds } from '@segnavia/html'
import { assertValidCues } from './controller-cues.ts'
import { referenceOverrides, resolvedPublishedShot } from './controller-options.ts'
import type { ControllerOptions, ResolvedContent } from './controller-types.ts'
import { resolveMediaContent } from './print-document.ts'

export function takeResolvedContent(
  prefetched: Map<string, Promise<ResolvedContent>>,
  slideId: string,
  resolve: () => Promise<ResolvedContent>,
): Promise<ResolvedContent> {
  const ready = prefetched.get(slideId)
  prefetched.delete(slideId)
  return ready ?? resolve()
}

export async function resolveFreshContent(
  slide: Slide,
  index: number,
  resolveSlide: ControllerOptions['resolveSlide'],
  resolveUrl: (path: string) => string,
  shots: Map<string, Promise<PublishedShot>>,
  placements: ControllerOptions['placements'],
  width: number,
  signal: AbortSignal,
): Promise<ResolvedContent> {
  const content = resolveSlide ? await resolveSlide(slide, index) : slide.content
  if ('kind' in content && content.kind === 'html' && placements) {
    const resolved = await resolvePlacementsWithSounds(content.html, {
      resolvePlacement: placements.resolve,
      report: placements.report,
      purpose: 'screen',
      width,
      signal,
      sounds: new Map(),
    })
    return { ...content, html: resolved.html, sounds: resolved.sounds }
  }
  if ('media' in content) return resolveMediaContent(content, placements, 'screen', width, signal)
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
