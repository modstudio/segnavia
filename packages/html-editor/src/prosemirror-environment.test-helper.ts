// ProseMirror reads this property while its browser module is evaluated. Other
// test files can leave a partial document stub in the shared Bun process.
const documentValue = (globalThis as { document?: { documentElement?: { style?: object } } }).document
if (documentValue && (typeof documentValue.documentElement?.style !== 'object' || documentValue.documentElement.style === null)) {
  if (documentValue.documentElement) Object.defineProperty(documentValue.documentElement, 'style', { configurable: true, value: {} })
  else Object.defineProperty(documentValue, 'documentElement', { configurable: true, value: { style: {} } })
}
