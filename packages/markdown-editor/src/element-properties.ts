import type { ElementDescriptor } from '@segnavia/frame/element-properties'

export const MARKDOWN_EDITOR_PROPERTIES = {
  tag: 'segnavia-markdown-editor',
  properties: ['markdown', 'mode', 'title', 'titleSource', 'lockedFences', 'css', 'fonts', 'fontReferences', 'linkOrigins', 'alertLabels'],
  events: {
    'segnavia-markdown-change': 'onSegnaviaMarkdownChange',
    'segnavia-title-change': 'onSegnaviaTitleChange',
    'segnavia-mode-change': 'onSegnaviaModeChange',
    'segnavia-save': 'onSegnaviaSave',
    'segnavia-editor-state': 'onSegnaviaEditorState',
    'segnavia-link-request': 'onSegnaviaLinkRequest',
  },
} as const satisfies ElementDescriptor
