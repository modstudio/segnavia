import { Book, MM_PER_PT, type Book as SegnaviaBook } from '@segnavia/format'
import { findActiveContent } from '@segnavia/html'
import type { IdmlModel, IdmlStory } from './model.ts'
import { refusal } from './refusal.ts'
import { ReportCollector } from './report.ts'
import { storyHtml } from './stories.ts'
import { StyleMapper } from './styles.ts'

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

export function modelToBook(model: IdmlModel, report = new ReportCollector(model.report)): SegnaviaBook {
  const preferences = model.preferences
  const rightBinding = preferences.binding === 'right-to-left'
  const bookDirection = rightBinding ? 'rtl' : 'ltr'
  const styles = new StyleMapper(model.styles ?? [], model.swatches ?? [], report, bookDirection)
  const bookLanguage = styles.rootLanguage()
  const mapped = orderedStories(model).map((story) => ({ story, mapped: storyHtml(story, styles, report, bookDirection, bookLanguage) }))
  const chapters = mapped.map(({ story, mapped: value }) => ({ title: story.id, html: value.html }))
  if (chapters.length === 0) throw refusal('the IDML has no stories', 'add at least one Story')
  const html = chapters.map((chapter) => chapter.html).join('')
  const active = findActiveContent(html)
  if (active.length > 0) throw refusal(`the imported Book contains active content (${active.join(', ')})`, 'remove that active content')
  const gutters = [...new Set(mapped.map(({ mapped: value }) => value.gutter).filter((value): value is number => value !== undefined))]
  if (gutters.length > 1) report.add(report.unsupportedElements, 'differing body frame gutters', model.id, gutters.length)
  const css = styles.css()
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
      ...(gutters[0] === undefined ? {} : { columnGap: gutters[0] * MM_PER_PT }),
    },
    dir: bookDirection,
    ...(bookLanguage ? { lang: bookLanguage } : {}),
    ...(css ? { css } : {}),
    rectoOpenings: preferences.facingPages,
    chapters,
  })
}
