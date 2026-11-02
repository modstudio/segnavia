import { defaultKeymap, history, historyKeymap, redoDepth, undoDepth } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { styleTags, Tag, tags } from '@lezer/highlight'
import { GFM } from '@lezer/markdown'

const mermaidLanguage = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid'],
  load: () => import('codemirror-lang-mermaid').then((module) => module.mermaid()),
})

function codeLanguage(info: string) {
  if (info.toLowerCase() === 'mermaid') return mermaidLanguage
  return LanguageDescription.matchLanguageName(languages, info, true)
}

const inlineCode = Tag.define(tags.monospace)

// Each color is host-owned. Inheriting by default leaves source mode wholly headless.
const highlight = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--segnavia-markdown-comment,inherit)' },
  { tag: [tags.keyword, tags.processingInstruction, tags.meta], color: 'var(--segnavia-markdown-keyword,inherit)' },
  { tag: [tags.string, tags.regexp], color: 'var(--segnavia-markdown-string,inherit)' },
  { tag: [tags.number, tags.bool, tags.atom], color: 'var(--segnavia-markdown-literal,inherit)' },
  { tag: [tags.heading, tags.strong], color: 'var(--segnavia-markdown-heading,inherit)' },
  { tag: [tags.link, tags.url], color: 'var(--segnavia-markdown-link,inherit)' },
  { tag: [inlineCode, tags.monospace], color: 'var(--segnavia-markdown-code,inherit)' },
  { tag: [tags.punctuation, tags.bracket, tags.labelName, tags.contentSeparator], color: 'var(--segnavia-markdown-mark,inherit)' },
  { tag: tags.invalid, color: 'var(--segnavia-markdown-invalid,inherit)' },
])

export type MarkdownSourceCallbacks = Readonly<{
  change: (markdown: string) => void
  save: () => void
  toggleMode: () => void
  state: (canUndo: boolean, canRedo: boolean) => void
}>

export function markdownSourceState(doc: string, callbacks: MarkdownSourceCallbacks): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      history(),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              callbacks.save()
              return true
            },
          },
          {
            key: 'Mod-Alt-m',
            preventDefault: true,
            run: () => {
              callbacks.toggleMode()
              return true
            },
          },
        ]),
      ),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.perLineTextDirection.of(true),
      markdown({ extensions: [GFM, { props: [styleTags({ InlineCode: inlineCode })] }], codeLanguages: codeLanguage }),
      syntaxHighlighting(highlight),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) callbacks.change(update.state.doc.toString())
        if (update.transactions.length) callbacks.state(undoDepth(update.state) > 0, redoDepth(update.state) > 0)
      }),
      EditorView.contentAttributes.of({ 'aria-label': 'Markdown body' }),
    ],
  })
}
