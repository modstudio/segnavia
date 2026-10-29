import { PublishedShot, type Slide } from '@segnavia/format'
import { assertValidCues } from './controller-cues.ts'
import { referenceOverrides, resolvedPublishedShot } from './controller-options.ts'
import type { ControllerOptions, ResolvedContent } from './controller-types.ts'

export async function resolveFreshContent(
  slide: Slide,
  index: number,
  resolveSlide: ControllerOptions['resolveSlide'],
  resolveUrl: (path: string) => string,
  shots: Map<string, Promise<PublishedShot>>,
): Promise<ResolvedContent> {
  const content = resolveSlide ? await resolveSlide(slide, index) : slide.content
  if (content.kind === 'shot') {
    assertValidCues(slide, content.shot.annotations.length)
    if (slide.content.kind !== 'shot-ref') return content
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
