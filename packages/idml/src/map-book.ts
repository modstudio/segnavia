import { Book, type BookItem, type BookSectionParents, MM_PER_PT, type ParentPage, type Book as SegnaviaBook } from '@segnavia/format'
import { findActiveContent } from '@segnavia/html'
import { anchoredFrameStyle } from './anchored-frames.ts'
import { chapterOpenings } from './chapter-openings.ts'
import { orderedStories, plainChapter } from './chapter-stories.ts'
import type { IdmlConversion } from './conversion.ts'
import { FontMapper } from './fonts.ts'
import { logicalMargin } from './margins.ts'
import { chapterParents, mapMasters, openingPage, storyPageUses } from './masters.ts'
import type { IdmlModel, IdmlStory } from './model.ts'
import { mapOpeners } from './openers.ts'
import { reportPlacements } from './placement-report.ts'
import { refusal } from './refusal.ts'
import { ReportCollector } from './report.ts'
import { type StoryHtmlResult, storyHtml } from './stories.ts'
import { StyleMapper } from './styles.ts'
import { resolveSwatchColor } from './swatch-color.ts'
import { TableStyleMapper } from './table-styles.ts'
import type { IdmlAnchoredFrame, IdmlImportOptions } from './types.ts'
import { matchVariables } from './variables.ts'

function bodyColumnGap(model: IdmlModel, stories: IdmlStory[], report: ReportCollector): number | undefined {
  const storyFrames = stories.flatMap((story) => (story.frame?.columns && story.frame.columns >= 2 ? [story.frame] : []))
  const frames = (model.bodyFramePreferences ?? storyFrames).filter((frame) => frame.columns >= 2)
  const representativeFrames = storyFrames.length > 0 ? storyFrames : frames
  const counts = new Map<number, number>()
  for (const frame of representativeFrames) counts.set(frame.gutter, (counts.get(frame.gutter) ?? 0) + 1)
  const selected = [...counts].sort((left, right) => right[1] - left[1])[0]?.[0]
  if (selected === undefined) return undefined
  for (const gutter of new Set(frames.map((frame) => frame.gutter).filter((gutter) => gutter !== selected))) {
    const frame = frames.find((candidate) => candidate.gutter === gutter)
    report.add(report.unsupportedElements, 'differing body frame gutters', frame?.location ?? model.id)
  }
  return selected
}

function anchoredFrameIssue(frame: IdmlAnchoredFrame, storyPages: { has(story: string): boolean }, depth: number, ancestors: Set<string>): string | undefined {
  if (frame.position !== 'InlinePosition') return frame.position
  if (ancestors.has(frame.story)) return 'cycle'
  if (storyPages.has(frame.story)) return 'InlinePosition'
  if (depth >= 3) return 'depth'
  if (frame.width === undefined) return 'missing geometry'
  return undefined
}

export function refuseActiveBookHtml(chapters: { html: string }[], parents: ParentPage[]): void {
  const html = [...chapters.map((chapter) => chapter.html), ...parents.flatMap((parent) => [parent.head ?? '', parent.foot ?? ''])].join('')
  const active = findActiveContent(html)
  if (active.length > 0) throw refusal(`the imported Book contains active content (${active.join(', ')})`, 'remove that active content')
}

interface ImportedChapter {
  story: string
  title: string
  html: string
  parents?: BookSectionParents
}

function partBody(chapters: ImportedChapter[], conversion: IdmlConversion): BookItem[] {
  const marker = conversion.answers.parts
  if ('none' in marker) return chapters.map(plainChapter)
  const byStory = new Map(chapters.map((chapter) => [chapter.story, chapter]))
  const body: BookItem[] = conversion.parts.leadingStories.flatMap((story) => byStory.get(story) ?? []).map(plainChapter)
  for (const [index, part] of conversion.parts.parts.entries()) {
    const runChapters = part.stories.flatMap((story) => byStory.get(story) ?? [])
    const openerStories = new Set(part.openerStories)
    const chapterStories = new Set(part.chapterStories)
    const opener = runChapters.filter((chapter) => openerStories.has(chapter.story))
    const children = runChapters.filter((chapter) => chapterStories.has(chapter.story)).map(plainChapter)
    body.push({
      name: `part-${index + 1}`,
      contents: true,
      ...(part.title ? { title: part.title } : {}),
      ...(opener.length > 0 ? { html: opener.map((chapter) => chapter.html).join('') } : {}),
      ...(opener[0]?.parents ? { parents: opener[0].parents } : {}),
      children,
    })
  }
  return body
}

export function modelToBook(
  model: IdmlModel,
  report = new ReportCollector(model.report),
  options: IdmlImportOptions = {},
  conversion?: IdmlConversion,
): SegnaviaBook {
  const preferences = model.preferences
  const rightBinding = preferences.binding === 'right-to-left'
  const bookDirection = rightBinding ? 'rtl' : 'ltr'
  const fonts = new FontMapper(model.fonts ?? [], options.font, report)
  const styles = new StyleMapper(model.styles ?? [], model.swatches ?? [], report, bookDirection, fonts)
  const tableStyles = new TableStyleMapper(model.styles ?? [], model.swatches ?? [], report, (css) => styles.cssOverrideClass(css))
  const matchedVariables = matchVariables(model.textVariables ?? [], report)
  const bookLanguage = styles.rootLanguage()
  const storyPages = storyPageUses(model)
  const anchoredStoryIds = new Set((model.anchoredFrames ?? []).map((frame) => frame.story))
  const anchoredOnly = new Set([...anchoredStoryIds].filter((story) => !storyPages.has(story)))
  const stories = orderedStories(model, anchoredOnly)
  const storyById = new Map(model.stories.map((story) => [story.id, story]))
  const frameByLocation = new Map((model.anchoredFrames ?? []).map((frame) => [frame.location, frame]))
  const renderStory = (story: IdmlStory, depth = 0, ancestors = new Set([story.id]), master = false): StoryHtmlResult =>
    storyHtml({ ...story, textVariables: matchedVariables, master }, styles, report, bookDirection, bookLanguage, {
      tableStyles,
      inlineParagraphs: depth > 0,
      anchored: (location, direction): string | undefined => {
        const frame = frameByLocation.get(location)
        if (!frame) {
          report.add(report.unsupportedElements, 'TextFrame', location)
          return undefined
        }
        if (frame.position === 'InlinePosition' && frame.anchorYoffset !== undefined && frame.anchorYoffset !== 0) {
          report.add(report.unsupportedElements, 'TextFrame anchored:AnchorYoffset', frame.location)
        }
        const issue = anchoredFrameIssue(frame, storyPages, depth, ancestors)
        if (issue) {
          report.add(report.unsupportedElements, `TextFrame anchored:${issue}`, frame.location)
          return undefined
        }
        const nested = storyById.get(frame.story)
        if (!nested) {
          report.add(report.unsupportedElements, 'TextFrame anchored:missing story', frame.location)
          return undefined
        }
        const nestedAncestors = new Set(ancestors)
        nestedAncestors.add(frame.story)
        const html = renderStory(nested, depth + 1, nestedAncestors, master).html
        const style = anchoredFrameStyle(frame, (color) => resolveSwatchColor(color, model.swatches ?? [], report, frame.location, 'fill'), direction)
        return `<span class="idml-anchored" style="${style}">${html}</span>`
      },
    })
  const masters = mapMasters(model, matchedVariables, styles, report, (story) => renderStory(story, 0, new Set([story.id]), true))
  const mapped = stories.map((story) => ({ story, mapped: renderStory(story) }))
  const openers = mapOpeners(model, mapped, storyPages, masters, report, options.asset, conversion?.openerPlan)
  reportPlacements(model, openers.consumedPages, report)
  const emitted = mapped.filter(({ story }) => !openers.claimed.has(story.id))
  const openings = emitted.flatMap(({ story }) => {
    const opening = openingPage(story.id, model, storyPages)
    return opening ? [{ story: story.id, page: opening.page.id, role: opening.role }] : []
  })
  const openingPolicy = chapterOpenings(openings, preferences.facingPages)
  for (const opening of openingPolicy.verso) report.versoOpening(opening.story, opening.page)
  const chapters = emitted.map(({ story, mapped: value }) => {
    const parents = chapterParents(story.id, model, storyPages, masters, report)
    return { story: story.id, title: story.id, html: openers.html.get(story.id) ?? value.html, ...(parents ? { parents } : {}) }
  })
  if (chapters.length === 0) throw refusal('the IDML has no stories', 'add at least one Story')
  refuseActiveBookHtml(chapters, masters.parents)
  const columnGap = bodyColumnGap(model, stories, report)
  const css = `${tableStyles.css()}${styles.css()}${masters.css}`
  const bookFonts = fonts.bookFonts()
  const body = conversion ? partBody(chapters, conversion) : chapters.map(plainChapter)
  return Book.parse({
    title: model.id,
    mode: 'paginated',
    page: {
      paper: { width: preferences.pageWidth, height: preferences.pageHeight, unit: 'pt' },
      margin: masters.bookMargin ?? logicalMargin(preferences.margin, rightBinding ? 'left' : 'right'),
      ...(columnGap === undefined ? {} : { columnGap: columnGap * MM_PER_PT }),
    },
    dir: bookDirection,
    ...(bookLanguage ? { lang: bookLanguage } : {}),
    ...(css ? { css } : {}),
    ...(bookFonts.length > 0 ? { fonts: bookFonts } : {}),
    rectoOpenings: openingPolicy.rectoOpenings,
    parentPages: masters.parents,
    body,
  })
}
