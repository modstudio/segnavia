export interface BookDocumentOptions {
  pageNumbers?: Record<string, string>
  blankBefore?: string[]
  part?: 'front' | 'body'
  crossLinks?: boolean
  targets?: boolean
}

export interface BookSectionInfo {
  id: string
  kind: 'front' | 'contents' | 'chapter' | 'endnotes'
  title?: string
  runningHead?: string
}

export type BookPrintPart = 'front' | 'body'

export function bookPrintPart(kind: BookSectionInfo['kind']): BookPrintPart {
  return kind === 'front' || kind === 'contents' ? 'front' : 'body'
}

export interface BookHeading {
  id: string
  level: number
  text: string
  sectionId: string
}

export interface BookDocument {
  html: string
  sections: BookSectionInfo[]
  headings: BookHeading[]
  issues: string[]
}
