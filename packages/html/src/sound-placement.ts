import { resolveDirection, type Sound } from '@segnavia/format'
import { type ChildNode, type Element, isTag } from 'domhandler'
import { parse } from './sanitize.ts'

export interface ResolvedSoundPlacement {
  sound: Sound
  src: string
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function isolatedText(className: string, value: Sound['title'] | Sound['credit']): string {
  if (!value) return ''
  const dir = resolveDirection(value.dir, value.lang, value.text)
  const lang = value.lang ? ` lang="${escapeText(value.lang)}"` : ''
  return `<span class="${className}"><bdi dir="${dir}"${lang}>${escapeText(value.text)}</bdi></span>`
}

function face(sound: Sound): string {
  const minutes = Math.floor(sound.durationMs / 60_000)
  const seconds = Math.floor((sound.durationMs % 60_000) / 1_000)
  const duration = `${minutes}:${String(seconds).padStart(2, '0')}`
  return `<span class="segnavia-sound-face"><span class="segnavia-sound-glyph" aria-hidden="true">♪</span><span class="segnavia-sound-text">${isolatedText('segnavia-sound-title', sound.title)}<span class="segnavia-sound-duration"><bdi dir="ltr">${duration}</bdi></span>${isolatedText('segnavia-sound-credit', sound.credit)}</span></span>`
}

function replaceChildren(element: Element, children: ChildNode[]): void {
  element.children = children
  for (const child of children) child.parent = element
}

export function applyResolvedSound(element: Element, resolved: ResolvedSoundPlacement, handle: string): void {
  const title = resolved.sound.title
  element.name = 'button'
  element.attribs = {
    type: 'button',
    'data-segnavia-sound': handle,
    ...(title
      ? {
          'aria-label': title.text,
          dir: resolveDirection(title.dir, title.lang, title.text),
          ...(title.lang ? { lang: title.lang } : {}),
        }
      : {}),
  }
  replaceChildren(element, parse(face(resolved.sound)).children.filter(isTag))
}
