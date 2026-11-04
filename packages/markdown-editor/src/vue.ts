import type { Assert, EventProps } from '@segnavia/frame/vue-types'
import type { DefineComponent } from 'vue'
import type { MARKDOWN_EDITOR_PROPERTIES } from './element-properties.ts'
import type { MarkdownEditorMode, MarkdownEditorStateDetail, SegnaviaMarkdownEditor } from './markdown-editor.ts'

export interface MarkdownEditorVueEventDetails {
  'segnavia-markdown-change': { markdown: string }
  'segnavia-title-change': { title: string }
  'segnavia-mode-change': { mode: MarkdownEditorMode }
  'segnavia-save': unknown
  'segnavia-editor-state': MarkdownEditorStateDetail
  'segnavia-link-request': { href: string | null }
}

type EventName = (typeof MARKDOWN_EDITOR_PROPERTIES.events)[number]
type _EveryPropertyExists = Assert<(typeof MARKDOWN_EDITOR_PROPERTIES.properties)[number] extends keyof SegnaviaMarkdownEditor ? true : false>
type _EveryEventHasDetail = Assert<EventName extends keyof MarkdownEditorVueEventDetails ? true : false>
type _EveryDetailIsAnEvent = Assert<keyof MarkdownEditorVueEventDetails extends EventName ? true : false>
type MarkdownEditorComponent = Partial<Pick<SegnaviaMarkdownEditor, (typeof MARKDOWN_EDITOR_PROPERTIES.properties)[number]>> &
  EventProps<typeof MARKDOWN_EDITOR_PROPERTIES.events, MarkdownEditorVueEventDetails>
type MarkdownEditorGlobalComponents = {
  [Tag in typeof MARKDOWN_EDITOR_PROPERTIES.tag]: DefineComponent<MarkdownEditorComponent>
}

declare module 'vue' {
  interface GlobalComponents extends MarkdownEditorGlobalComponents {}
}
