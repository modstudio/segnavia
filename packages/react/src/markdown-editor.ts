import '@segnavia/markdown-editor'
import type { MarkdownEditorMode, MarkdownEditorStateDetail, MarkdownTitleSource, SegnaviaMarkdownEditor } from '@segnavia/markdown-editor'
import type { HTMLAttributes, ReactNode } from 'react'
import type { ElementDescriptor, PropsFor } from './elements.ts'
import { createComponent } from './index.ts'

type ElementProps<E> = Omit<HTMLAttributes<E>, 'children'> & { children?: ReactNode }
type CustomEventProp<D = unknown> = (event: CustomEvent<D>) => void

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
  tag: 'segnavia-markdown-editor',
  properties: ['markdown', 'mode', 'title', 'titleSource', 'lockedFences', 'css', 'fonts', 'fontReferences', 'linkOrigins', 'alertLabels'],
  events: {
    onSegnaviaMarkdownChange: 'segnavia-markdown-change',
    onSegnaviaTitleChange: 'segnavia-title-change',
    onSegnaviaModeChange: 'segnavia-mode-change',
    onSegnaviaSave: 'segnavia-save',
    onSegnaviaEditorState: 'segnavia-editor-state',
    onSegnaviaLinkRequest: 'segnavia-link-request',
  },
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
