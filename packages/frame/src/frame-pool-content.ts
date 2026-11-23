import { comparableContent } from './content-value.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import type { PoolOptions } from './frame-pool-options.ts'

export function poolContentValue(
  content: ResolvedContent,
  scripts: NonNullable<DeckState['deck']>['scripts'],
  controller: DeckController,
  options: PoolOptions,
) {
  return comparableContent(
    content,
    (path) => controller.url(path),
    scripts,
    `${options.fontCss ?? ''}${options.css}`,
    options.csp,
    options.origins,
    options.forms,
  )
}
