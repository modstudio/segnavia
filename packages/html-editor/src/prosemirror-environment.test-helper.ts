// ProseMirror reads this property while its browser module is evaluated. Other
// test files can leave a partial document stub in the shared Bun process.
const documentValue = (globalThis as { document?: { documentElement?: { style?: object } } }).document
if (documentValue?.documentElement && !documentValue.documentElement.style) documentValue.documentElement.style = {}
