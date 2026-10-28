import { type Element, isTag } from 'domhandler'
import type { IdmlFramePreference } from './types.ts'
import { localName, numberAttribute } from './xml.ts'

function preferenceElement(frame: Element): Element | undefined {
  const pending = [...frame.children]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node || !isTag(node)) continue
    if (localName(node.name) === 'TextFramePreference') return node
    pending.push(...node.children)
  }
  return undefined
}

export function framePreference(frame: Element, location: string): IdmlFramePreference | undefined {
  const element = preferenceElement(frame)
  if (!element) return undefined
  return {
    columns: numberAttribute(element, 'TextColumnCount', 1),
    gutter: numberAttribute(element, 'TextColumnGutter', 0),
    location,
  }
}

export class FramePreferenceIndex {
  private readonly byStory = new Map<string, IdmlFramePreference[]>()

  add(story: string, preference: IdmlFramePreference | undefined): void {
    if (!preference || preference.columns < 2) return
    const values = this.byStory.get(story) ?? []
    values.push(preference)
    this.byStory.set(story, values)
  }

  preferred(story: string): IdmlFramePreference | undefined {
    const values = this.byStory.get(story) ?? []
    const counts = new Map<string, number>()
    for (const value of values) {
      const key = `${value.columns}\u0000${value.gutter}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const selected = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0]
    return values.find((value) => `${value.columns}\u0000${value.gutter}` === selected)
  }

  values(): IdmlFramePreference[] {
    return [...this.byStory.values()].flat()
  }
}
