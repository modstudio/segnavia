import { Book, MM_PER_PT, type Book as SegnaviaBook } from '@segnavia/format'
import { findActiveContent } from '@segnavia/html'
import { chapterParents, mapMasters } from './masters.ts'
import type { IdmlModel, IdmlStory } from './model.ts'
import { refusal } from './refusal.ts'
import { ReportCollector } from './report.ts'
import { storyHtml } from './stories.ts'
import { StyleMapper } from './styles.ts'
import type { IdmlTextVariable } from './types.ts'

function orderedStories(model: IdmlModel): IdmlStory[] {
  const order = new Map<string, number>()
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const story of page.stories) if (!order.has(story)) order.set(story, order.size)
    }
  }
  const masterStories = new Set(model.masterStoryIds)
  return model.stories
    .filter((story) => !masterStories.has(story.id))
    .sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
}

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

export function modelToBook(model: IdmlModel, report = new ReportCollector(model.report)): SegnaviaBook {
  const preferences = model.preferences
  const rightBinding = preferences.binding === 'right-to-left'
  const bookDirection = rightBinding ? 'rtl' : 'ltr'
  const styles = new StyleMapper(model.styles ?? [], model.swatches ?? [], report, bookDirection)
  const matchVariables: IdmlTextVariable[] = []
  const matchedStyles = new Set<string>()
  for (const variable of model.textVariables ?? []) {
    if (variable.type !== 'MatchCharacterStyleType' || !variable.appliedCharacterStyle) {
      report.add(report.unsupportedElements, `TextVariable:${variable.name}`, variable.location)
      continue
    }
    if (matchedStyles.has(variable.appliedCharacterStyle)) {
      report.add(report.unsupportedElements, `TextVariable duplicate style:${variable.name}`, variable.location)
      continue
    }
    matchedStyles.add(variable.appliedCharacterStyle)
    matchVariables.push(variable)
  }
  const bookLanguage = styles.rootLanguage()
  const stories = orderedStories(model)
  const masters = mapMasters({ ...model, textVariables: matchVariables }, styles, report)
  const mapped = stories.map((story) => ({
    story,
    mapped: storyHtml({ ...story, textVariables: matchVariables }, styles, report, bookDirection, bookLanguage),
  }))
  const chapters = mapped.map(({ story, mapped: value }) => {
    const parents = chapterParents(story.id, model, masters, report)
    return { title: story.id, html: value.html, ...(parents ? { parents } : {}) }
  })
  if (chapters.length === 0) throw refusal('the IDML has no stories', 'add at least one Story')
  const html = chapters.map((chapter) => chapter.html).join('')
  const active = findActiveContent(html)
  if (active.length > 0) throw refusal(`the imported Book contains active content (${active.join(', ')})`, 'remove that active content')
  const columnGap = bodyColumnGap(model, stories, report)
  const css = `${styles.css()}${masters.css}`
  return Book.parse({
    title: model.id,
    mode: 'paginated',
    page: {
      paper: { width: preferences.pageWidth, height: preferences.pageHeight, unit: 'pt' },
      margin: {
        top: preferences.margin.top * MM_PER_PT,
        bottom: preferences.margin.bottom * MM_PER_PT,
        inner: (rightBinding ? preferences.margin.right : preferences.margin.left) * MM_PER_PT,
        outer: (rightBinding ? preferences.margin.left : preferences.margin.right) * MM_PER_PT,
      },
      ...(columnGap === undefined ? {} : { columnGap: columnGap * MM_PER_PT }),
    },
    dir: bookDirection,
    ...(bookLanguage ? { lang: bookLanguage } : {}),
    ...(css ? { css } : {}),
    rectoOpenings: preferences.facingPages,
    parentPages: masters.parents,
    chapters,
  })
}
