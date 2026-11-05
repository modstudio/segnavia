import type { IdmlFindings } from './findings.ts'

export type IdmlPartMarker =
  | { master: string }
  | { paragraphStyle: string }
  | { section: true }
  | { pages: string[] }
  | { none: true }

export interface StoryFirstPage {
  story: string
  page: string
}

export interface IdmlPartRun {
  openerPage?: string
  stories: string[]
}

type MarkerKind = 'master' | 'paragraphStyle' | 'section' | 'pages' | 'none'

const markedPages: Record<MarkerKind, (findings: IdmlFindings, marker: IdmlPartMarker) => string[]> = {
  master: (findings, marker) => findings.pages.filter((page) => page.appliedMaster === ('master' in marker ? marker.master : '')).map((page) => page.name),
  paragraphStyle: (findings, marker) => findings.paragraphStyles.find((style) => style.name === ('paragraphStyle' in marker ? marker.paragraphStyle : ''))?.pages.map((use) => use.page) ?? [],
  section: (findings) => findings.sections.map((section) => section.startPage),
  pages: (_findings, marker) => ('pages' in marker ? marker.pages : []),
  none: () => [],
}

function markerKind(marker: IdmlPartMarker): MarkerKind {
  return Object.keys(marker)[0] as MarkerKind
}

export function partRuns(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], marker: IdmlPartMarker): IdmlPartRun[] {
  const pageByName = new Map(findings.pages.map((page) => [page.name, page]))
  const startsByPage = new Map<string, string[]>()
  for (const { story, page } of storyFirstPages) startsByPage.set(page, [...(startsByPage.get(page) ?? []), story])
  const boundaries: string[] = []
  for (const page of markedPages[markerKind(marker)](findings, marker)) {
    const previous = boundaries.at(-1)
    const sharesSpread = previous !== undefined && pageByName.get(previous)?.spread === pageByName.get(page)?.spread
    if (sharesSpread && (startsByPage.get(page)?.length ?? 0) === 0) continue
    if (!boundaries.includes(page)) boundaries.push(page)
  }
  const boundarySet = new Set(boundaries)
  const runs: IdmlPartRun[] = []
  let current: IdmlPartRun = { stories: [] }
  runs.push(current)
  for (const page of findings.pages) {
    if (boundarySet.has(page.name)) {
      current = { openerPage: page.name, stories: [] }
      runs.push(current)
    }
    current.stories.push(...(startsByPage.get(page.name) ?? []))
  }
  const known = new Set(runs.flatMap((run) => run.stories))
  runs.at(-1)?.stories.push(...storyFirstPages.filter(({ story }) => !known.has(story)).map(({ story }) => story))
  return runs.filter((run) => run.openerPage !== undefined || run.stories.length > 0)
}
