import type { BookOpens, SectionNumbering } from '@segnavia/format'

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
  division: 'front' | 'body' | 'end'
  title?: string
  opens?: BookOpens
  values?: Record<string, string>
  record?: { index: number; count: number }
  parts?: Record<string, string>
  numbering?: SectionNumbering
}

export type BookPrintPart = 'front' | 'body'

export function bookPrintPart(division: BookSectionInfo['division']): BookPrintPart {
  return division === 'front' ? 'front' : 'body'
}

export interface BookHeading {
  id: string
  level: number
  text: string
  contentsLabel?: string
  subtitle?: string
  sectionId: string
  depth?: number
}

export function headingLabel(heading: BookHeading): string {
  return heading.contentsLabel ?? heading.text
}

export interface BookDocument {
  html: string
  sections: BookSectionInfo[]
  headings: BookHeading[]
  pageReferenceTargets: string[]
  issues: string[]
}
