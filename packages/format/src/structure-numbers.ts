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
  return [...section.ancestry].reverse().find((part) => part.numbering?.[key] !== undefined)?.numbering?.[key]
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

interface NumberState {
  result: Map<string, StructureNumberValue>
  partCounts: Map<string, number>
  chapterCount: number
  restartedParts: Set<string>
}

function addPartNumber(section: BookSectionEntry, settings: StructureNumberSettings, state: NumberState): void {
  const entry = section.entry
  if (!isPart(entry) || entry.number === false) return
  const parent = section.ancestry.map((part) => part.id).join('/')
  const key = `${section.depth}:${parent}`
  const configured = enclosingSetting(section, 'part')
  const held = state.partCounts.get(key)
  const count = held === undefined ? (configured?.restart ?? 1) : held + 1
  state.partCounts.set(key, count)
  const enabled = settings.parts !== undefined || configured !== undefined || entry.number !== undefined
  const style = configured?.style ?? settings.parts?.style ?? defaultStyle('part', settings.lang)
  state.result.set(section.id, { level: 'part', count, ...(enabled ? { text: authoredText(entry.number, count, style) } : {}) })
}

function addChapterNumber(section: BookSectionEntry, settings: StructureNumberSettings, state: NumberState): void {
  if (!isChapterSection(section)) return
  const entry = section.entry as BookSectionEntry['entry'] & { number?: string | number | false }
  if (entry.number === false) return
  const configured = enclosingSetting(section, 'chapter')
  const owner = [...section.ancestry].reverse().find((part) => part.numbering?.chapters?.restart !== undefined)
  if (owner && !state.restartedParts.has(owner.id)) {
    state.chapterCount = owner.numbering?.chapters?.restart ?? state.chapterCount
    state.restartedParts.add(owner.id)
  } else state.chapterCount += 1
  const enabled = settings.chapters !== undefined || configured !== undefined || entry.number !== undefined
  const style = configured?.style ?? settings.chapters?.style ?? defaultStyle('chapter', settings.lang)
  state.result.set(section.id, {
    level: 'chapter',
    count: state.chapterCount,
    ...(enabled ? { text: authoredText(entry.number, state.chapterCount, style) } : {}),
  })
}

/** Computes the one structure number consumed by contents, outlines, headings and running heads. */
export function structureNumbers(sections: readonly BookSectionEntry[], settings: StructureNumberSettings = {}): Map<string, StructureNumberValue> {
  const state: NumberState = { result: new Map(), partCounts: new Map(), chapterCount: 0, restartedParts: new Set() }
  for (const section of sections) {
    if (isPart(section.entry)) addPartNumber(section, settings, state)
    else addChapterNumber(section, settings, state)
  }
  return state.result
}
