// Test files share one process, and prosemirror-view reads document.documentElement.style
// when it is first evaluated, so complete any document stub left by an earlier file.
if (globalThis.document && !globalThis.document.documentElement) {
  Object.defineProperty(globalThis.document, 'documentElement', { configurable: true, value: { style: {} } })
}
