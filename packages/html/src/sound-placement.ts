import { resolveDirection, type Sound, soundFace } from '@segnavia/format'
import { type ChildNode, type Element, isTag } from 'domhandler'
import { parse } from './sanitize.ts'

export interface ResolvedSoundPlacement {
  sound: Sound
  src: string
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
  replaceChildren(element, parse(soundFace(resolved.sound)).children.filter(isTag))
}
