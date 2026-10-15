export interface BookDocumentOptions {
  pageNumbers?: Record<string, string>
  blankBefore?: string[]
}

export interface BookSectionInfo {
  id: string
  kind: 'front' | 'contents' | 'chapter' | 'endnotes'
  title?: string
  runningHead?: string
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
