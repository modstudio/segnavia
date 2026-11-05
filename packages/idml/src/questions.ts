import type { IdmlFindings } from './findings.ts'
import { type IdmlPartMarker, partRuns, type StoryFirstPage } from './part-runs.ts'

export type IdmlTitleAnswer = { paragraphStyle: string } | { firstParagraph: true } | { list: string[] }
export interface IdmlAnswers {
  parts?: IdmlPartMarker
  titles?: IdmlTitleAnswer
}
export type IdmlAnswer = IdmlPartMarker | IdmlTitleAnswer
export interface IdmlPreview {
  parts: { openerPage: string; title?: string; chapters: number }[]
  untitled: number
}
export interface IdmlCandidate {
  answer: IdmlAnswer
  label: string
  preview: IdmlPreview
}
export interface IdmlQuestion {
  id: 'parts' | 'titles'
  prompt: string
  candidates: IdmlCandidate[]
  accepts?: 'pages' | 'titles'
}
export interface IdmlInspection {
  findings: IdmlFindings
  questions: IdmlQuestion[]
}

function titleFor(findings: IdmlFindings, pageName: string, answer: IdmlTitleAnswer | undefined, index: number): string | undefined {
  const page = findings.pages.find((candidate) => candidate.name === pageName)
  if (!page || !answer) return undefined
  if ('list' in answer) return answer.list[index]
  if ('paragraphStyle' in answer) return page.paragraphs.find((paragraph) => paragraph.style === answer.paragraphStyle)?.text
  return page.paragraphs.find((paragraph) => paragraph.text)?.text
}

export function idmlPreview(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], marker: IdmlPartMarker, titles?: IdmlTitleAnswer): IdmlPreview {
  const firstPage = new Map(storyFirstPages.map(({ story, page }) => [story, page]))
  const parts = partRuns(findings, storyFirstPages, marker).flatMap((run, index) => {
    if (!run.openerPage) return []
    const title = titleFor(findings, run.openerPage, titles, index)
    return [
      { openerPage: run.openerPage, ...(title ? { title } : {}), chapters: run.stories.filter((story) => firstPage.get(story) !== run.openerPage).length },
    ]
  })
  return { parts, untitled: parts.filter((part) => !part.title).length }
}

function partCount(candidate: IdmlCandidate): number {
  return candidate.preview.parts.length
}

function structuralPartCandidates(findings: IdmlFindings, storyFirstPages: StoryFirstPage[]): IdmlCandidate[] {
  const markers: { answer: IdmlPartMarker; label: string }[] = []
  for (const master of findings.masters) {
    if (master.pages.length >= 2 && master.pages.length < findings.pages.length)
      markers.push({ answer: { master: master.name }, label: `Master ${master.name}` })
  }
  for (const style of findings.paragraphStyles) {
    if (!style.name.startsWith('$ID/') && style.pages.length >= 2 && style.pages.every((use) => use.count <= 1)) {
      markers.push({ answer: { paragraphStyle: style.name }, label: `Paragraph style ${style.name}` })
    }
  }
  if (findings.sections.length > 1) markers.push({ answer: { section: true }, label: 'IDML sections' })
  const collapsed = new Map<string, IdmlCandidate>()
  for (const marker of markers) {
    const preview = idmlPreview(findings, storyFirstPages, marker.answer)
    const key = JSON.stringify(partRuns(findings, storyFirstPages, marker.answer).map((run) => [run.openerPage, run.stories]))
    const previous = collapsed.get(key)
    if (previous) previous.label = `${previous.label}; ${marker.label}`
    else collapsed.set(key, { ...marker, preview })
  }
  return [...collapsed.values()].sort((left, right) => partCount(left) - partCount(right))
}

function titleCandidates(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], marker: IdmlPartMarker): IdmlCandidate[] {
  const openers = new Set(partRuns(findings, storyFirstPages, marker).flatMap((run) => run.openerPage ?? []))
  const styles = findings.paragraphStyles.filter((style) => style.pages.some((use) => openers.has(use.page)))
  return [
    ...styles.map((style) => {
      const answer = { paragraphStyle: style.name }
      const titled = style.pages.filter((use) => openers.has(use.page)).length
      return {
        answer,
        label: `Paragraph style ${style.name} (${titled} of ${openers.size} parts)`,
        preview: idmlPreview(findings, storyFirstPages, marker, answer),
      }
    }),
    {
      answer: { firstParagraph: true },
      label: 'First paragraph on each opener',
      preview: idmlPreview(findings, storyFirstPages, marker, { firstParagraph: true }),
    },
    { answer: { list: [] }, label: 'Host-supplied titles', preview: idmlPreview(findings, storyFirstPages, marker) },
  ]
}

export function idmlQuestions(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], answers: IdmlAnswers = {}): IdmlQuestion[] {
  if (!answers.parts) {
    const structural = structuralPartCandidates(findings, storyFirstPages)
    if (structural.length === 0) return []
    return [
      {
        id: 'parts',
        prompt: 'What in this IDML marks the beginning of each book part?',
        candidates: [
          ...structural,
          { answer: { pages: [] }, label: 'Choose opener pages', preview: { parts: [], untitled: 0 } },
          { answer: { none: true }, label: 'Keep the book flat', preview: { parts: [], untitled: 0 } },
        ],
        accepts: 'pages',
      },
    ]
  }
  if ('none' in answers.parts || answers.titles) return []
  return [
    {
      id: 'titles',
      prompt: 'How should the imported parts be titled?',
      candidates: titleCandidates(findings, storyFirstPages, answers.parts),
      accepts: 'titles',
    },
  ]
}
