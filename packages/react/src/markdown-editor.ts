import '@segnavia/frame/markdown-editor'
import { ELEMENTS } from './elements.ts'
import { createComponent } from './index.ts'

export const MarkdownEditor = createComponent(ELEMENTS.markdownEditor)
export type { MarkdownEditorProps } from './props.ts'
