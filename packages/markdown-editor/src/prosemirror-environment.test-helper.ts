// Test files share one process, and prosemirror-view reads document.documentElement.style
// when it is first evaluated, so complete either part of a document stub left by an earlier file.
const documentElement = globalThis.document?.documentElement
if (globalThis.document && (typeof documentElement?.style !== 'object' || documentElement.style === null)) {
  if (documentElement) Object.defineProperty(documentElement, 'style', { configurable: true, value: {} })
  else Object.defineProperty(globalThis.document, 'documentElement', { configurable: true, value: { style: {} } })
}
