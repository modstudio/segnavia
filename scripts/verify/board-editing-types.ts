export interface DemoDocument {
  type: 'document'
  kind: 'board'
}

export interface DemoItem {
  id: string
  x: number
  y: number
  width: number
}

export interface DemoSection {
  id: string
  rectangle: { x: number; y: number; width: number; height: number }
  items: string[]
}

export interface DemoBoard {
  direction: 'ltr' | 'rtl'
  items: DemoItem[]
  sections: DemoSection[]
}

export interface DemoChange {
  board: DemoDocument
  before: DemoDocument
  batch: { base: string; ops: unknown[] }
  edit: { kind: string; ids?: string[] }
}
