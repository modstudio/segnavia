import type { ElementPropertyTable } from '@segnavia/frame/element-properties'

export const MARKDOWN_EDITOR_TAG = 'segnavia-markdown-editor'

export const MARKDOWN_EDITOR_PROPERTIES = {
  tag: MARKDOWN_EDITOR_TAG,
  properties: ['markdown', 'mode', 'title', 'titleSource', 'lockedFences', 'css', 'fonts', 'fontReferences', 'linkOrigins', 'alertLabels'],
  events: ['segnavia-markdown-change', 'segnavia-title-change', 'segnavia-mode-change', 'segnavia-save', 'segnavia-editor-state', 'segnavia-link-request'],
} as const satisfies ElementPropertyTable
