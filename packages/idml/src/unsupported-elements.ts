import type { Element } from 'domhandler'
import type { ReportCollector } from './report.ts'

const MAPPED_ELEMENTS = new Set([
  'Document',
  'DocumentPreference',
  'MarginPreference',
  'MasterSpread',
  'Spread',
  'Page',
  'Story',
  'TextFrame',
  'TextFramePreference',
  'PathGeometry',
  'GeometryPathType',
  'PathPointArray',
  'PathPointType',
  'Styles',
  'Graphic',
])

function localName(name: string): string {
  return name.includes(':') ? (name.split(':').at(-1) ?? name) : name
}

export function collectUnsupportedElements(parts: { name: string; all: Element[] }[], report: ReportCollector): Map<string, number> {
  for (const part of parts) {
    if (part.name.startsWith('Stories/') || part.name.endsWith('/Styles.xml') || part.name.endsWith('/Graphic.xml')) continue
    for (const element of part.all) {
      const name = localName(element.name)
      if (!MAPPED_ELEMENTS.has(name)) report.add(report.unsupportedElements, name, part.name)
    }
  }
  return report.unsupportedElements
}
