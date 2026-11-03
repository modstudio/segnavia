import '@segnavia/markdown-editor'
import {
  MARKDOWN_EDITOR_PROPERTIES,
  type MarkdownEditorMode,
  type MarkdownEditorStateDetail,
  type MarkdownTitleSource,
  type SegnaviaMarkdownEditor,
} from '@segnavia/markdown-editor'
import type { ElementDescriptor, PropsFor } from './elements.ts'
import { createComponent } from './index.ts'
import type { CustomEventProp, ElementProps } from './props.ts'

export interface MarkdownEditorProps extends Omit<ElementProps<HTMLElement>, 'title'> {
  markdown?: string
  mode?: MarkdownEditorMode
  title?: string | null
  titleSource?: MarkdownTitleSource
  dir?: string
  lang?: string
  unstyled?: boolean
  lockedFences?: Record<string, string>
  css?: string
  fonts?: SegnaviaMarkdownEditor['fonts']
  fontReferences?: SegnaviaMarkdownEditor['fontReferences']
  linkOrigins?: SegnaviaMarkdownEditor['linkOrigins']
  alertLabels?: SegnaviaMarkdownEditor['alertLabels']
  onSegnaviaMarkdownChange?: CustomEventProp<{ markdown: string }>
  onSegnaviaTitleChange?: CustomEventProp<{ title: string }>
  onSegnaviaModeChange?: CustomEventProp<{ mode: MarkdownEditorMode }>
  onSegnaviaSave?: CustomEventProp
  onSegnaviaEditorState?: CustomEventProp<MarkdownEditorStateDetail>
  onSegnaviaLinkRequest?: CustomEventProp<{ href: string | null }>
}

const markdownEditor: ElementDescriptor<SegnaviaMarkdownEditor, MarkdownEditorProps, 'segnavia-markdown-editor'> = {
  ...MARKDOWN_EDITOR_PROPERTIES,
}

export const MarkdownEditor = createComponent(markdownEditor)

export type SegnaviaMarkdownEditorIntrinsicElements = {
  'segnavia-markdown-editor': PropsFor<typeof markdownEditor>
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends SegnaviaMarkdownEditorIntrinsicElements {}
  }
}
