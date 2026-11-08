export interface DemoDocument {
  type: 'document'
  kind: 'board'
}

export interface DemoChange {
  board: DemoDocument
  before: DemoDocument
  batch: { base: string; ops: unknown[] }
  edit: { kind: string; ids?: string[] }
}
