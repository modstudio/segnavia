const DEFINED_FIELDS = new Set(['title', 'authors', 'subject', 'lang'])
const STANDARD_PDF_INFO_KEYS = new Set(['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped'])
const ASCII_XML_LOCAL_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export function metadataExtraKeyIssue(key: string): string | undefined {
  if (DEFINED_FIELDS.has(key)) return `extra key "${key}" collides with the defined field "${key}"; remove it from extra`
  if (STANDARD_PDF_INFO_KEYS.has(key)) return `extra key "${key}" is a standard PDF Info key; choose another name`
  if (!ASCII_XML_LOCAL_NAME.test(key)) return `extra key "${key}" is not an ASCII XML local name; use an ASCII XML local name`
  return undefined
}

export function metadataExtraKeyAllowed(key: string): boolean {
  return metadataExtraKeyIssue(key) === undefined
}
