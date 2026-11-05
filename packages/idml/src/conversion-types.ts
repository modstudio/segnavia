export interface IdmlFindingPage {
  id: string
  name: string
  spread: string
  appliedMaster?: string
  stories: string[]
  paragraphs: { style: string; text: string }[]
}

export interface IdmlPageUse {
  page: string
  count: number
  texts: string[]
}

export interface IdmlFindings {
  pages: IdmlFindingPage[]
  masters: { name: string; pages: string[] }[]
  sections: { name: string; startPage: string; pages: string[] }[]
  paragraphStyles: { name: string; pages: IdmlPageUse[] }[]
}

export type IdmlPartMarker = { master: string } | { paragraphStyle: string } | { section: true } | { pages: string[] } | { none: true }
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
  answer?: IdmlAnswer
  label: string
  preview: IdmlPreview
}
export interface IdmlQuestion {
  id: 'parts' | 'titles'
  prompt: string
  candidates: IdmlCandidate[]
  accepts: 'pages' | 'titles'
}
export interface IdmlInspection {
  findings: IdmlFindings
  questions: IdmlQuestion[]
}
