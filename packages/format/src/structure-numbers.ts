import { type BookSectionEntry, isBookContents, isPart } from './book-section.ts'
import { formatNumber, isHebrew, type NumberSystem } from './numbering.ts'

export interface StructureNumberValue {
  level: 'part' | 'chapter'
  count: number
  text?: string
}

export interface StructureNumberSettings {
  lang?: string
  parts?: { style?: NumberSystem }
  chapters?: { style?: NumberSystem }
}

type Level = StructureNumberValue['level']

function defaultStyle(level: Level, lang: string | undefined): NumberSystem {
  if (isHebrew(lang)) return 'hebrew'
  return level === 'part' ? 'roman-upper' : 'arabic'
}

function enclosingSetting(section: BookSectionEntry, level: Level) {
  const key = level === 'part' ? 'parts' : 'chapters'
  return section.ancestry.findLast((part) => part.numbering?.[key] !== undefined)?.numbering?.[key]
}

function authoredText(authored: string | number | false | undefined, count: number, style: NumberSystem): string | undefined {
  if (authored === false) return undefined
  if (typeof authored === 'string') return authored
  return formatNumber(authored ?? count, style)
}

function isChapterSection(section: BookSectionEntry): boolean {
  if (section.division !== 'body' || isPart(section.entry) || isBookContents(section.entry)) return false
  return !('record' in section.entry && section.entry.record !== undefined)
}

/** Computes the one structure number consumed by contents, outlines, headings and running heads. */
export function structureNumbers(sections: readonly BookSectionEntry[], settings: StructureNumberSettings = {}): Map<string, StructureNumberValue> {
  const result = new Map<string, StructureNumberValue>()
  const partCounts = new Map<string, number>()
  let chapterCount = 0
  const restartedParts = new Set<string>()

  for (const section of sections) {
    const { entry } = section
    if (isPart(entry)) {
      if (entry.number === false) continue
      const parent = section.ancestry.map((part) => part.id).join('/')
      const key = `${section.depth}:${parent}`
      const configured = enclosingSetting(section, 'part')
      const count = (partCounts.get(key) ?? configured?.restart ?? 0) + (partCounts.has(key) ? 1 : configured?.restart === undefined ? 1 : 0)
      partCounts.set(key, count)
      const enabled = settings.parts !== undefined || configured !== undefined || entry.number !== undefined
      const style = configured?.style ?? settings.parts?.style ?? defaultStyle('part', settings.lang)
      result.set(section.id, { level: 'part', count, ...(enabled ? { text: authoredText(entry.number, count, style) } : {}) })
      continue
    }
    if (!isChapterSection(section) || entry.number === false) continue
    const configured = enclosingSetting(section, 'chapter')
    const owner = section.ancestry.findLast((part) => part.numbering?.chapters?.restart !== undefined)
    if (owner && !restartedParts.has(owner.id)) {
      chapterCount = owner.numbering?.chapters?.restart ?? chapterCount
      restartedParts.add(owner.id)
    } else chapterCount += 1
    const enabled = settings.chapters !== undefined || configured !== undefined || entry.number !== undefined
    const style = configured?.style ?? settings.chapters?.style ?? defaultStyle('chapter', settings.lang)
    result.set(section.id, { level: 'chapter', count: chapterCount, ...(enabled ? { text: authoredText(entry.number, chapterCount, style) } : {}) })
  }
  return result
}
