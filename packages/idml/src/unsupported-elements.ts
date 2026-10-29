import type { Element } from 'domhandler'
import type { ReportCollector } from './report.ts'
import { localName } from './xml.ts'

export const SHAPE_ELEMENTS = ['Polygon', 'Rectangle', 'Oval', 'GraphicLine'] as const
export const GRAPHIC_ELEMENTS = ['Image', 'PDF', 'EPS', 'ImportedPage', 'SVG'] as const

const MAPPED_ELEMENTS = new Set([
  'Document',
  'DocumentPreference',
  'MarginPreference',
  'MasterSpread',
  'Spread',
  'Page',
  'Story',
  'TextFrame',
  'Group',
  ...SHAPE_ELEMENTS,
  ...GRAPHIC_ELEMENTS,
  'Link',
  'TextFramePreference',
  'PathGeometry',
  'GeometryPathType',
  'PathPointArray',
  'PathPointType',
  'Styles',
  'Graphic',
  'RootParagraphStyleGroup',
  'ParagraphStyleGroup',
  'RootCharacterStyleGroup',
  'CharacterStyleGroup',
  'ParagraphStyle',
  'CharacterStyle',
  'RootObjectStyleGroup',
  'ObjectStyleGroup',
  'ObjectStyle',
  'AnchoredObjectSetting',
  'Color',
  'TextVariable',
  'MatchCharacterStylePreference',
  'Properties',
])

function insideMappedResource(element: Element): boolean {
  let parent = element.parent
  while (parent && 'name' in parent) {
    const name = localName(parent.name)
    if (name === 'ParagraphStyle' || name === 'CharacterStyle' || name === 'ObjectStyle' || name === 'Color') return true
    parent = parent.parent
  }
  return false
}

export function collectUnsupportedElements(parts: { name: string; all: Element[] }[], report: ReportCollector): Map<string, number> {
  for (const part of parts) {
    if (part.name.startsWith('Stories/')) continue
    for (const element of part.all) {
      const name = localName(element.name)
      if (!MAPPED_ELEMENTS.has(name) && !insideMappedResource(element)) report.add(report.unsupportedElements, name, part.name)
    }
  }
  return report.unsupportedElements
}
