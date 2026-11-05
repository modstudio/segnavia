import { orderedStories } from './chapter-stories.ts'
import type { IdmlAnswers, IdmlFindings, IdmlInspection, IdmlPartMarker } from './conversion-types.ts'
import { idmlFindings } from './findings.ts'
import { openingPage, storyPageUses } from './masters.ts'
import type { IdmlModel } from './model.ts'
import { type OpenerPlan, planOpeners } from './openers.ts'
import { markerKind, type PartModelStories, partModel, type ResolvedPartModel, type StoryFirstPage } from './part-runs.ts'
import { idmlQuestions } from './questions.ts'
import { refusal } from './refusal.ts'

export interface IdmlConversion {
  findings: IdmlFindings
  storyFirstPages: StoryFirstPage[]
  storyModel: PartModelStories
  openerPlan: OpenerPlan
  parts: ResolvedPartModel
  answers: IdmlAnswers & { parts: IdmlPartMarker }
}

interface ConversionFacts {
  findings: IdmlFindings
  storyFirstPages: StoryFirstPage[]
  storyModel: PartModelStories
  openerPlan: OpenerPlan
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
        if (opening) result.push({ story, page: opening.page.name })
        seen.add(story)
      }
    }
  }
  return result
}

function conversionFacts(model: IdmlModel): ConversionFacts {
  const findings = idmlFindings(model)
  const uses = storyPageUses(model)
  const anchoredIds = new Set((model.anchoredFrames ?? []).map((frame) => frame.story))
  const anchoredOnly = new Set([...anchoredIds].filter((story) => !uses.has(story)))
  const stories = orderedStories(model, anchoredOnly)
  const openerPlan = planOpeners(model, stories, uses)
  return {
    findings,
    storyFirstPages: storyStarts(model),
    storyModel: { universe: stories.map((story) => story.id), claimed: openerPlan.claimed },
    openerPlan,
  }
}

function list(values: string[]): string {
  return values.length > 0 ? values.map((value) => JSON.stringify(value)).join(', ') : '(none)'
}

function answerText(value: unknown): string {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? String(value) : encoded
}

function answerRefusal(kind: 'parts' | 'titles', value: unknown, accepted: string): never {
  throw refusal(`the ${kind} answer is ${answerText(value)}, which cannot be read`, `answer ${kind} with exactly one of ${accepted}`)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validParts(value: unknown): boolean {
  if (!record(value) || Object.keys(value).length !== 1) return false
  if (typeof value.master === 'string' || typeof value.paragraphStyle === 'string') return true
  if (value.section === true || value.none === true) return true
  return Array.isArray(value.pages) && value.pages.length > 0 && value.pages.every((page) => typeof page === 'string')
}

function validTitles(value: unknown): boolean {
  if (!record(value) || Object.keys(value).length !== 1) return false
  if (typeof value.paragraphStyle === 'string' || value.firstParagraph === true) return true
  return Array.isArray(value.list) && value.list.every((title) => typeof title === 'string')
}

function validateAnswerShape(value: unknown): asserts value is IdmlAnswers {
  if (!record(value) || Object.keys(value).some((key) => key !== 'parts' && key !== 'titles')) {
    throw refusal(`the IDML answers are ${answerText(value)}, which cannot be read`, 'pass an object containing only parts and titles answers')
  }
  if (value.parts !== undefined && !validParts(value.parts))
    answerRefusal('parts', value.parts, '{ master: string }, { paragraphStyle: string }, { section: true }, { pages: non-empty string[] }, { none: true }')
  if (value.titles !== undefined && !validTitles(value.titles))
    answerRefusal('titles', value.titles, '{ paragraphStyle: string }, { firstParagraph: true }, { list: string[] }')
  if (value.titles !== undefined && value.parts === undefined)
    throw refusal(`the titles answer is ${answerText(value.titles)}, but there is no parts answer`, 'answer parts before answering titles')
}

type MarkerKind = ReturnType<typeof markerKind>

const markerValidators: Record<MarkerKind, (findings: IdmlFindings, marker: IdmlPartMarker) => void> = {
  master: (findings, marker) => {
    const name = 'master' in marker ? marker.master : ''
    if (!findings.masters.some((master) => master.name === name))
      throw refusal(
        `the IDML has no master spread named ${JSON.stringify(name)}; it has ${list(findings.masters.map((master) => master.name))}`,
        'answer parts with a master the file holds',
      )
  },
  paragraphStyle: (findings, marker) => {
    const name = 'paragraphStyle' in marker ? marker.paragraphStyle : ''
    if (!findings.paragraphStyles.some((style) => style.name === name))
      throw refusal(
        `the IDML has no paragraph style named ${JSON.stringify(name)}; it has ${list(findings.paragraphStyles.map((style) => style.name))}`,
        'answer parts with a paragraph style the file holds',
      )
  },
  section: (findings) => {
    if (findings.sections.length === 0) throw refusal('the IDML has no sections', 'choose a parts marker the file holds')
  },
  pages: (findings, marker) => {
    const pages = 'pages' in marker ? marker.pages : []
    const known = new Set(findings.pages.map((page) => page.name))
    const unknown = pages.filter((page) => !known.has(page))
    if (unknown.length > 0)
      throw refusal(`the parts answer names unknown pages ${list(unknown)}; the IDML has ${list([...known])}`, 'answer parts with pages the file holds')
  },
  none: () => {},
}

function validateAnswers(facts: ConversionFacts, answers: IdmlAnswers): void {
  const { findings } = facts
  const parts = answers.parts
  if (parts) markerValidators[markerKind(parts)](findings, parts)
  const titles = answers.titles
  if (titles && 'paragraphStyle' in titles && !findings.paragraphStyles.some((style) => style.name === titles.paragraphStyle))
    throw refusal(
      `the IDML has no paragraph style named ${JSON.stringify(titles.paragraphStyle)}; it has ${list(findings.paragraphStyles.map((style) => style.name))}`,
      'answer titles with a paragraph style the file holds',
    )
}

function readAnswers(facts: ConversionFacts, value: unknown): IdmlAnswers {
  validateAnswerShape(value)
  validateAnswers(facts, value)
  return value
}

export function inspectModel(model: IdmlModel, value: unknown = {}): IdmlInspection {
  const facts = conversionFacts(model)
  const answers = readAnswers(facts, value)
  if (answers.parts && answers.titles && 'list' in answers.titles) {
    const resolved = partModel(facts.findings, facts.storyFirstPages, answers.parts, answers.titles, facts.storyModel)
    validateTitleCount(resolved, answers.titles.list.length)
  }
  return { findings: facts.findings, questions: idmlQuestions(facts.findings, facts.storyFirstPages, answers, facts.storyModel) }
}

function validateTitleCount(parts: ResolvedPartModel, supplied: number): void {
  const count = parts.parts.length
  if (supplied !== count)
    throw refusal(`the titles answer has ${supplied} titles, but the parts answer produces ${count} parts`, `supply exactly ${count} titles in part order`)
}

export function conversionFor(model: IdmlModel, value: unknown = {}): IdmlConversion {
  const facts = conversionFacts(model)
  const answers = readAnswers(facts, value)
  const resolved = answers.parts ? partModel(facts.findings, facts.storyFirstPages, answers.parts, answers.titles, facts.storyModel) : undefined
  if (resolved && answers.titles && 'list' in answers.titles) validateTitleCount(resolved, answers.titles.list.length)
  const questions = idmlQuestions(facts.findings, facts.storyFirstPages, answers, facts.storyModel)
  if (questions.length > 0) {
    const question = questions[0]
    if (question)
      throw refusal(
        `IDML conversion question ${JSON.stringify(question.id)} is unanswered; candidates: ${question.candidates.map((candidate) => candidate.label).join('; ')}`,
        `inspect the IDML and pass answers.${question.id}`,
      )
  }
  const completeAnswers: IdmlAnswers & { parts: IdmlPartMarker } = answers.parts ? { ...answers, parts: answers.parts } : { ...answers, parts: { none: true } }
  return {
    ...facts,
    answers: completeAnswers,
    parts: resolved ?? partModel(facts.findings, facts.storyFirstPages, completeAnswers.parts, completeAnswers.titles, facts.storyModel),
  }
}
