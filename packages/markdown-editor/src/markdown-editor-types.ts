import type { FontReference } from '@segnavia/format'
import type { FontsOptions } from '@segnavia/frame/fonts'
import type { AlertLabels } from '@segnavia/html'
import type { MarkdownEditorLabels } from './markdown-editor-labels.ts'
import type { MarkdownTitleSource } from './markdown-editor-model.ts'
import type { MarkdownEditorCommand, MarkdownEditorCommandArgs, MarkdownEditorMode } from './markdown-editor-policy.ts'

export type MarkdownEditorStateDetail = Readonly<{ marks: string[]; nodes: string[]; canUndo: boolean; canRedo: boolean }>

export interface SegnaviaMarkdownEditor extends Omit<HTMLElement, 'title'> {
  markdown: string
  mode: MarkdownEditorMode
  readonly modes: readonly ['rich', 'source']
  title: string | null
  titleSource: MarkdownTitleSource
  lockedFences: Record<string, string>
  css: string
  fonts: FontsOptions | undefined
  fontReferences: FontReference[]
  linkOrigins: Iterable<string> | undefined
  alertLabels: Partial<AlertLabels> | undefined
  labels: Partial<MarkdownEditorLabels>
  unstyled: boolean
  run<C extends MarkdownEditorCommand>(command: C, args?: C extends keyof MarkdownEditorCommandArgs ? MarkdownEditorCommandArgs[C] : never): boolean
}
