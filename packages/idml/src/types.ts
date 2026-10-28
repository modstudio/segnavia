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
