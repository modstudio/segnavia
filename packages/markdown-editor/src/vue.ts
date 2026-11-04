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
type Assert<T extends true> = T
type _EveryPropertyExists = Assert<(typeof MARKDOWN_EDITOR_PROPERTIES.properties)[number] extends keyof SegnaviaMarkdownEditor ? true : false>
type _EveryEventHasDetail = Assert<EventName extends keyof MarkdownEditorVueEventDetails ? true : false>
type CamelEvent<S extends string> = S extends `${infer Head}-${infer Tail}` ? `${Capitalize<Head>}${CamelEvent<Tail>}` : Capitalize<S>
type EventProps = {
  [E in EventName as `on${CamelEvent<E>}`]?: (event: CustomEvent<MarkdownEditorVueEventDetails[E]>) => void
}
type MarkdownEditorComponent = Partial<Pick<SegnaviaMarkdownEditor, (typeof MARKDOWN_EDITOR_PROPERTIES.properties)[number]>> & EventProps

declare module 'vue' {
  interface GlobalComponents {
    'segnavia-markdown-editor': DefineComponent<MarkdownEditorComponent>
  }
}
