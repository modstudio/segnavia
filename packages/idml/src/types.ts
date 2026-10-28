export interface IdmlTextNode {
  name: string
  attributes: Record<string, string>
  text?: string
  children: IdmlTextNode[]
  location: string
}

export interface IdmlStyle {
  id: string
  name: string
  kind: 'paragraph' | 'character'
  basedOn?: string
  properties: Record<string, string>
  location: string
}

export interface IdmlSwatch {
  id: string
  name: string
  model: 'rgb' | 'cmyk' | 'spot' | 'named'
  values?: number[]
}

export interface IdmlFramePreference {
  columns: number
  gutter: number
  location?: string
}

export interface IdmlStory {
  id: string
  part: string
  direction?: 'ltr' | 'rtl'
  root?: IdmlTextNode
  frame?: IdmlFramePreference
}

export interface IdmlTextVariable {
  id: string
  name: string
  type: string
  appliedCharacterStyle?: string
  searchStrategy?: string
  location: string
}

export interface IdmlMargin {
  top: number
  bottom: number
  left: number
  right: number
}
export interface IdmlDocumentPreferences {
  pageWidth: number
  pageHeight: number
  facingPages: boolean
  binding: 'left-to-right' | 'right-to-left'
  margin: IdmlMargin
}
export interface IdmlPage {
  id: string
  appliedMaster?: string
  stories: string[]
  side?: 'left' | 'right' | 'single'
}
export interface IdmlSpread {
  id: string
  pages: IdmlPage[]
}
export interface IdmlMasterFrame {
  id: string
  story: string
  bounds: { left: number; top: number; width: number; height: number }
}
export interface IdmlMasterPage extends IdmlPage {
  margin: IdmlMargin
  frames: IdmlMasterFrame[]
}
export interface IdmlMasterSpread {
  id: string
  name: string
  basedOn?: string
  pages: IdmlMasterPage[]
  unmappedItems: { type: string; id: string }[]
}
