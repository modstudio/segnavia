import type { IdmlAnswers, IdmlCandidate, IdmlFindings, IdmlPartMarker, IdmlPreview, IdmlQuestion, IdmlTitleAnswer } from './conversion-types.ts'
import { type PartModelStories, partModel, partRuns, type StoryFirstPage } from './part-runs.ts'

export type { IdmlAnswer, IdmlAnswers, IdmlCandidate, IdmlInspection, IdmlPreview, IdmlQuestion, IdmlTitleAnswer } from './conversion-types.ts'

export function idmlPreview(
  findings: IdmlFindings,
  storyFirstPages: StoryFirstPage[],
  marker: IdmlPartMarker,
  titles?: IdmlTitleAnswer,
  stories: PartModelStories = {},
): IdmlPreview {
  const parts = partModel(findings, storyFirstPages, marker, titles, stories).parts.map((part) => ({
    openerPage: part.openerPage,
    ...(part.title ? { title: part.title } : {}),
    chapters: part.chapterStories.length,
  }))
  return { parts, untitled: parts.filter((part) => !part.title).length }
}

function partCount(candidate: IdmlCandidate): number {
  return candidate.preview.parts.length
}

function structuralPartCandidates(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], stories: PartModelStories): IdmlCandidate[] {
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
    const preview = idmlPreview(findings, storyFirstPages, marker.answer, undefined, stories)
    const key = JSON.stringify(partRuns(findings, storyFirstPages, marker.answer, stories).map((run) => [run.openerPage, run.stories]))
    const previous = collapsed.get(key)
    if (previous) previous.label = `${previous.label}; ${marker.label}`
    else collapsed.set(key, { ...marker, preview })
  }
  return [...collapsed.values()].sort((left, right) => partCount(left) - partCount(right))
}

function titleCandidates(findings: IdmlFindings, storyFirstPages: StoryFirstPage[], marker: IdmlPartMarker, stories: PartModelStories): IdmlCandidate[] {
  const openers = new Set(partModel(findings, storyFirstPages, marker, undefined, stories).parts.map((part) => part.openerPage))
  const styles = findings.paragraphStyles.filter((style) => style.pages.some((use) => openers.has(use.page)))
  return [
    ...styles.map((style) => {
      const answer = { paragraphStyle: style.name }
      const titled = style.pages.filter((use) => openers.has(use.page)).length
      return {
        answer,
        label: `Paragraph style ${style.name} (${titled} of ${openers.size} parts)`,
        preview: idmlPreview(findings, storyFirstPages, marker, answer, stories),
      }
    }),
    {
      answer: { firstParagraph: true },
      label: 'First paragraph on each opener',
      preview: idmlPreview(findings, storyFirstPages, marker, { firstParagraph: true }, stories),
    },
    { label: 'Host-supplied titles', preview: idmlPreview(findings, storyFirstPages, marker, undefined, stories) },
  ]
}

const accepts = { parts: 'pages', titles: 'titles' } as const

export function idmlQuestions(
  findings: IdmlFindings,
  storyFirstPages: StoryFirstPage[],
  answers: IdmlAnswers = {},
  stories: PartModelStories = {},
): IdmlQuestion[] {
  if (!answers.parts) {
    const structural = structuralPartCandidates(findings, storyFirstPages, stories)
    if (structural.length === 0) return []
    return [
      {
        id: 'parts',
        prompt: 'What in this IDML marks the beginning of each book part?',
        candidates: [
          ...structural,
          { label: 'Choose opener pages', preview: { parts: [], untitled: 0 } },
          { answer: { none: true }, label: 'Keep the book flat', preview: { parts: [], untitled: 0 } },
        ],
        accepts: accepts.parts,
      },
    ]
  }
  if ('none' in answers.parts || answers.titles) return []
  return [
    {
      id: 'titles',
      prompt: 'How should the imported parts be titled?',
      candidates: titleCandidates(findings, storyFirstPages, answers.parts, stories),
      accepts: accepts.titles,
    },
  ]
}
