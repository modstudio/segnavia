import type { IdmlFindings, IdmlPartMarker, IdmlTitleAnswer } from './conversion-types.ts'

export type { IdmlPartMarker } from './conversion-types.ts'

export interface StoryFirstPage {
  story: string
  page: string
}

export interface IdmlPartRun {
  openerPage?: string
  stories: string[]
}

export interface ResolvedPart {
  openerPage: string
  stories: string[]
  openerStories: string[]
  chapterStories: string[]
  title?: string
}

export interface ResolvedPartModel {
  leadingStories: string[]
  parts: ResolvedPart[]
}

export interface PartModelStories {
  universe?: string[]
  claimed?: ReadonlySet<string>
}

type MarkerKind = keyof typeof markedPages

const markedPages = {
  master: (findings: IdmlFindings, marker: IdmlPartMarker) =>
    findings.pages.filter((page) => page.appliedMaster === ('master' in marker ? marker.master : '')).map((page) => page.name),
  paragraphStyle: (findings: IdmlFindings, marker: IdmlPartMarker) =>
    findings.paragraphStyles.find((style) => style.name === ('paragraphStyle' in marker ? marker.paragraphStyle : ''))?.pages.map((use) => use.page) ?? [],
  section: (findings: IdmlFindings) => findings.sections.map((section) => section.startPage),
  pages: (_findings: IdmlFindings, marker: IdmlPartMarker) => ('pages' in marker ? marker.pages : []),
  none: () => [],
} satisfies Record<string, (findings: IdmlFindings, marker: IdmlPartMarker) => string[]>

export function markerKind(marker: IdmlPartMarker): MarkerKind {
  return Object.keys(marker)[0] as MarkerKind
}

function titleFor(findings: IdmlFindings, pageName: string, answer: IdmlTitleAnswer | undefined, partIndex: number): string | undefined {
  const page = findings.pages.find((candidate) => candidate.name === pageName)
  if (!page || !answer) return undefined
  if ('list' in answer) return answer.list[partIndex]
  if ('paragraphStyle' in answer) return page.paragraphs.find((paragraph) => paragraph.style === answer.paragraphStyle)?.text
  return page.paragraphs.find((paragraph) => paragraph.text)?.text
}

export function partRuns(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], marker: IdmlPartMarker, stories: PartModelStories = {}): IdmlPartRun[] {
  const claimed = stories.claimed ?? new Set<string>()
  const starts = storyFirstPages.filter(({ story }) => !claimed.has(story))
  const pageByName = new Map(findings.pages.map((page) => [page.name, page]))
  const startsByPage = new Map<string, string[]>()
  for (const { story, page } of starts) startsByPage.set(page, [...(startsByPage.get(page) ?? []), story])
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
  const universe = (stories.universe ?? starts.map(({ story }) => story)).filter((story) => !claimed.has(story))
  const known = new Set(runs.flatMap((run) => run.stories))
  runs.at(-1)?.stories.push(...universe.filter((story) => !known.has(story)))
  return runs.filter((run) => run.stories.length > 0)
}

export function partModel(
  findings: IdmlFindings,
  storyFirstPages: StoryFirstPage[],
  marker: IdmlPartMarker,
  titles?: IdmlTitleAnswer,
  stories: PartModelStories = {},
): ResolvedPartModel {
  const runs = partRuns(findings, storyFirstPages, marker, stories)
  const firstPage = new Map(storyFirstPages.map(({ story, page }) => [story, page]))
  const leadingStories = runs.find((run) => !run.openerPage)?.stories ?? []
  let partIndex = 0
  const parts = runs.flatMap((run) => {
    if (!run.openerPage) return []
    const title = titleFor(findings, run.openerPage, titles, partIndex)
    partIndex += 1
    return [
      {
        openerPage: run.openerPage,
        stories: run.stories,
        openerStories: run.stories.filter((story) => firstPage.get(story) === run.openerPage),
        chapterStories: run.stories.filter((story) => firstPage.get(story) !== run.openerPage),
        ...(title ? { title } : {}),
      },
    ]
  })
  return { leadingStories, parts }
}
