import { type Element, isTag } from 'domhandler'
import type { IdmlFramePreference, IdmlStory, IdmlTextNode } from './types.ts'

function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

function textNode(node: Element, part: string, path: string): IdmlTextNode {
  const children: IdmlTextNode[] = []
  let childIndex = 0
  for (const child of node.children) {
    childIndex += 1
    if (isTag(child)) children.push(textNode(child, part, `${path}/${localName(child.name)}[${childIndex}]`))
    else if (child.type === 'directive') {
      children.push({ name: '#processing-instruction', attributes: {}, text: child.data, children: [], location: `${part}${path}#pi${childIndex}` })
    }
  }
  const directText = node.children
    .filter((child) => child.type === 'text')
    .map((child) => child.data)
    .join('')
  return {
    name: localName(node.name),
    attributes: { ...node.attribs },
    ...(directText ? { text: directText } : {}),
    children,
    location: `${part}${path}`,
  }
}

export function parseStories(parts: { name: string; all: Element[] }[], framePreferences: Map<string, IdmlFramePreference>): IdmlStory[] {
  const result: IdmlStory[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    for (const element of part.all.filter((candidate) => localName(candidate.name) === 'Story')) {
      const id = element.attribs.Self
      if (!id || seen.has(id)) continue
      seen.add(id)
      const rawDirection = element.attribs.StoryDirection
      const direction = rawDirection?.includes('RightToLeft') ? 'rtl' : rawDirection?.includes('LeftToRight') ? 'ltr' : undefined
      result.push({
        id,
        part: part.name,
        root: textNode(element, part.name, `/Story[@Self=${id}]`),
        ...(direction ? { direction } : {}),
        ...(framePreferences.get(id) ? { frame: framePreferences.get(id) } : {}),
      })
    }
  }
  return result
}
