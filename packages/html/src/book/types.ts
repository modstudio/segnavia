import { type BookOpens, type HeadingListing, type ParentRules, plainText, type RunText, type SectionNumbering } from '@segnavia/format'
import type { ChildNode } from 'domhandler'

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
  number?: string
  opens?: BookOpens
  values?: Record<string, string>
  record?: { index: number; count: number }
  parts?: Record<string, string>
  partNumbers?: Record<string, string>
  numbering?: SectionNumbering
  parentRules?: ParentRules
}

export type BookPrintPart = 'front' | 'body'

export function bookPrintPart(division: BookSectionInfo['division']): BookPrintPart {
  return division === 'front' ? 'front' : 'body'
}

export interface BookHeading {
  id: string
  block: string
  level: number
  /** The normalized plain label for authored headings, or the section heading's language runs. */
  text: RunText
  number?: string
  contentsLabel?: RunText
  subtitle?: RunText
  /** Authored inline nodes with ids, library data, and note calls removed and links unwrapped; contents prefer these when no contentsLabel is set. */
  content?: ChildNode[]
  sectionId: string
  depth?: number
  contentsDepth?: number
  listed: HeadingListing
}

export function headingLabel(heading: BookHeading): RunText {
  return heading.contentsLabel ?? heading.text
}

export function numberedHeadingLabel(heading: BookHeading): string {
  const label = plainText(headingLabel(heading))
  return heading.number === undefined ? label : `${heading.number} ${label}`
}

export interface BookDocument {
  html: string
  sections: BookSectionInfo[]
  headings: BookHeading[]
  pageReferenceTargets: string[]
  issues: string[]
}
