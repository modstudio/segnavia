export interface BookDocumentOptions {
  pageNumbers?: Record<string, string>
  blankBefore?: string[]
  part?: 'front' | 'body'
  crossLinks?: boolean
  targets?: boolean
  build?: BookBuild
}

export type BookBuild = 'print' | 'galley' | 'flow'

export interface BookSectionInfo {
  id: string
  kind: 'front' | 'contents' | 'part' | 'chapter' | 'endnotes' | 'designed' | 'templated'
  division?: 'front' | 'body' | 'end'
  title?: string
  runningHead?: string
}

export type BookPrintPart = 'front' | 'body'

export function bookPrintPart(kind: BookSectionInfo['kind'], division?: BookSectionInfo['division']): BookPrintPart {
  if (division !== undefined) return division === 'front' ? 'front' : 'body'
  return kind === 'front' || kind === 'contents' ? 'front' : 'body'
}

export interface BookHeading {
  id: string
  level: number
  text: string
  sectionId: string
  depth?: number
}

export interface BookDocument {
  html: string
  sections: BookSectionInfo[]
  headings: BookHeading[]
  issues: string[]
}
