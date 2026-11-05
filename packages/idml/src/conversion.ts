import { type IdmlFindings, idmlFindings } from './findings.ts'
import { openingPage, storyPageUses } from './masters.ts'
import type { IdmlModel } from './model.ts'
import { partRuns, type StoryFirstPage } from './part-runs.ts'
import { type IdmlAnswers, type IdmlInspection, idmlQuestions } from './questions.ts'
import { refusal } from './refusal.ts'

export interface IdmlConversion {
  findings: IdmlFindings
  storyFirstPages: StoryFirstPage[]
  answers: IdmlAnswers
}

function storyStarts(model: IdmlModel): StoryFirstPage[] {
  const uses = storyPageUses(model)
  const masterStories = new Set(model.masterStoryIds)
  const result: StoryFirstPage[] = []
  const seen = new Set<string>()
  for (const spread of model.spreads) {
    for (const page of spread.pages) {
      for (const story of page.stories) {
        if (seen.has(story) || masterStories.has(story)) continue
        const opening = openingPage(story, model, uses)
        if (opening) result.push({ story, page: opening.page.name ?? opening.page.id })
        seen.add(story)
      }
    }
  }
  return result
}

function list(values: string[]): string {
  return values.length > 0 ? values.map((value) => JSON.stringify(value)).join(', ') : '(none)'
}

function validateAnswers(findings: IdmlFindings, starts: StoryFirstPage[], answers: IdmlAnswers): void {
  const parts = answers.parts
  if (parts && 'master' in parts && !findings.masters.some((master) => master.name === parts.master)) {
    throw refusal(
      `the IDML has no master spread named ${JSON.stringify(parts.master)}; it has ${list(findings.masters.map((master) => master.name))}`,
      'answer parts with a master the file holds',
    )
  }
  if (parts && 'paragraphStyle' in parts && !findings.paragraphStyles.some((style) => style.name === parts.paragraphStyle)) {
    throw refusal(
      `the IDML has no paragraph style named ${JSON.stringify(parts.paragraphStyle)}; it has ${list(findings.paragraphStyles.map((style) => style.name))}`,
      'answer parts with a paragraph style the file holds',
    )
  }
  if (parts && 'section' in parts && findings.sections.length === 0) throw refusal('the IDML has no sections', 'choose a parts marker the file holds')
  if (parts && 'pages' in parts) {
    const known = new Set(findings.pages.map((page) => page.name))
    const unknown = parts.pages.filter((page) => !known.has(page))
    if (unknown.length > 0)
      throw refusal(`the parts answer names unknown pages ${list(unknown)}; the IDML has ${list([...known])}`, 'answer parts with pages the file holds')
  }
  const titles = answers.titles
  if (titles && 'paragraphStyle' in titles && !findings.paragraphStyles.some((style) => style.name === titles.paragraphStyle)) {
    throw refusal(
      `the IDML has no paragraph style named ${JSON.stringify(titles.paragraphStyle)}; it has ${list(findings.paragraphStyles.map((style) => style.name))}`,
      'answer titles with a paragraph style the file holds',
    )
  }
  if (parts && titles && 'list' in titles) {
    const count = partRuns(findings, starts, parts).filter((run) => run.openerPage).length
    if (titles.list.length !== count)
      throw refusal(
        `the titles answer has ${titles.list.length} titles, but the parts answer produces ${count} parts`,
        `supply exactly ${count} titles in part order`,
      )
  }
}

export function inspectModel(model: IdmlModel, answers: IdmlAnswers = {}): IdmlInspection {
  const findings = idmlFindings(model)
  const starts = storyStarts(model)
  validateAnswers(findings, starts, answers)
  return { findings, questions: idmlQuestions(findings, starts, answers) }
}

export function conversionFor(model: IdmlModel, answers: IdmlAnswers = {}): IdmlConversion {
  const findings = idmlFindings(model)
  const storyFirstPages = storyStarts(model)
  validateAnswers(findings, storyFirstPages, answers)
  const questions = idmlQuestions(findings, storyFirstPages, answers)
  if (questions.length > 0) {
    const question = questions[0]
    if (question)
      throw refusal(
        `IDML conversion question ${JSON.stringify(question.id)} is unanswered; candidates: ${question.candidates.map((candidate) => candidate.label).join('; ')}`,
        `inspect the IDML and pass answers.${question.id}`,
      )
  }
  return { findings, storyFirstPages, answers: answers.parts ? answers : { ...answers, parts: { none: true } } }
}
