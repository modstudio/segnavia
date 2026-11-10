export const COMPOSE_PROGRESS_PAGES_LIMIT = 10_000

export interface ComposeProgress {
  readonly pages: number
  readonly total?: number
}

export function boundComposeProgress(value: unknown): ComposeProgress | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const { pages, total } = value as { pages?: unknown; total?: unknown }
  if (!Number.isInteger(pages) || (pages as number) < 0 || (pages as number) > COMPOSE_PROGRESS_PAGES_LIMIT) return undefined
  if (total === undefined) return { pages: pages as number }
  if (!Number.isInteger(total) || (total as number) < 0 || (total as number) > COMPOSE_PROGRESS_PAGES_LIMIT || (pages as number) > (total as number)) {
    return undefined
  }
  return { pages: pages as number, total: total as number }
}
