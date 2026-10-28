import { type Element, isTag } from 'domhandler'
import type { FramePreferenceIndex } from './frame-preferences.ts'
import type { ReportCollector } from './report.ts'
import { activeIdmlValue } from './style-property-report.ts'
import type { IdmlStory, IdmlTextNode } from './types.ts'
import { idmlDirection, localName } from './xml.ts'

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

function storyDirection(element: Element, part: string, id: string, report: ReportCollector): 'ltr' | 'rtl' | undefined {
  const preference = element.children.find((child): child is Element => isTag(child) && localName(child.name) === 'StoryPreference')
  for (const [name, value] of Object.entries(preference?.attribs ?? {})) {
    if (name !== 'StoryDirection' && activeIdmlValue(value)) {
      report.add(report.unsupportedElements, `StoryPreference:${name}`, `${part}#${id}`)
    }
  }
  return idmlDirection(preference?.attribs.StoryDirection ?? element.attribs.StoryDirection)
}

export function parseStories(parts: { name: string; all: Element[] }[], framePreferences: FramePreferenceIndex, report: ReportCollector): IdmlStory[] {
  const result: IdmlStory[] = []
  const seen = new Set<string>()
  for (const part of parts) {
    for (const element of part.all.filter((candidate) => localName(candidate.name) === 'Story')) {
      const id = element.attribs.Self
      if (!id || seen.has(id)) continue
      seen.add(id)
      const direction = storyDirection(element, part.name, id, report)
      const frame = framePreferences.preferred(id)
      result.push({
        id,
        part: part.name,
        root: textNode(element, part.name, `/Story[@Self=${id}]`),
        ...(direction ? { direction } : {}),
        ...(frame ? { frame } : {}),
      })
    }
  }
  return result
}
