import type { FontReferenceInput } from '@segnavia/format'

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

export interface IdmlFont {
  family: string
  style?: string
  postscriptName?: string
}

export type IdmlFontMap = (font: IdmlFont) => FontReferenceInput | undefined
export type IdmlAssetMap = (uri: string) => string | undefined
export interface IdmlImportOptions {
  font?: IdmlFontMap
  asset?: IdmlAssetMap
}

export type IdmlPoint = [number, number]
export interface IdmlBounds {
  left: number
  top: number
  right: number
  bottom: number
}
export interface IdmlPathPoint {
  anchor: IdmlPoint
  left: IdmlPoint
  right: IdmlPoint
}
export interface IdmlPolygon {
  paths: { open: boolean; points: IdmlPathPoint[] }[]
  fill: string
  stroke?: { color: string; weight: number }
  location: string
}
export interface IdmlArtPlacement {
  bounds: IdmlBounds
  polygons: IdmlPolygon[]
  location: string
}
export interface IdmlFramePlacement {
  bounds: IdmlBounds
  story: string
  location: string
}
export interface IdmlLinkPlacement {
  bounds: IdmlBounds
  uri: string
  location: string
}
export interface IdmlUnmappedPlacement {
  name: string
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

export interface IdmlAnchoredFrame {
  hostStory: string
  story: string
  location: string
  width?: number
  position: string
  anchorYoffset?: number
  fill?: string
  stroke?: { color: string; weight: number }
  corners?: {
    topLeft?: number
    topRight?: number
    bottomLeft?: number
    bottomRight?: number
  }
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
  bodyFrames?: IdmlFramePlacement[]
  art?: IdmlArtPlacement[]
  links?: IdmlLinkPlacement[]
  unmapped?: IdmlUnmappedPlacement[]
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
