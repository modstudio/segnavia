import { annotationCueIssues, type Slide } from '@segnavia/format'

export function assertValidCues(slide: Slide, annotationCount: number) {
  const issues = annotationCueIssues(slide.narration, annotationCount)
  if (issues.length > 0) throw new Error(`Slide "${slide.id}" has invalid cues: ${issues.join('; ')}.`)
}
