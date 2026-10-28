import { Book, MM_PER_PT, type Book as SegnaviaBook } from '@segnavia/format'
import { findActiveContent } from '@segnavia/html'
import serialize from 'dom-serializer'
import { Element } from 'domhandler'
import type { IdmlModel, IdmlStory } from './model.ts'
import { refusal } from './refusal.ts'

const emptyParagraph = (): string => serialize(new Element('p', {}, []), { xmlMode: false })

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

export function modelToBook(model: IdmlModel): SegnaviaBook {
  const preferences = model.preferences
  const rightBinding = preferences.binding === 'right-to-left'
  const chapters = orderedStories(model).map((story) => ({ title: story.id, html: emptyParagraph() }))
  if (chapters.length === 0) throw refusal('the IDML has no stories', 'add at least one Story')
  const html = chapters.map((chapter) => chapter.html).join('')
  const active = findActiveContent(html)
  if (active.length > 0) throw refusal(`the imported Book contains active content (${active.join(', ')})`, 'remove that active content')
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
    },
    dir: rightBinding ? 'rtl' : 'ltr',
    rectoOpenings: preferences.facingPages,
    chapters,
  })
}
