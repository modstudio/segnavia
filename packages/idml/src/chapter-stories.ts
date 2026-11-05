import type { IdmlModel, IdmlStory } from './model.ts'

export function orderedStories(model: IdmlModel, anchoredOnly = new Set<string>()): IdmlStory[] {
  const order = new Map<string, number>()
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const story of page.stories) if (!order.has(story)) order.set(story, order.size)
    }
  }
  const masterStories = new Set(model.masterStoryIds)
  return model.stories
    .filter((story) => !masterStories.has(story.id) && !anchoredOnly.has(story.id))
    .sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER))
}

export function plainChapter<T extends { story: string }>({ story: _story, ...chapter }: T): Omit<T, 'story'> {
  return chapter
}
