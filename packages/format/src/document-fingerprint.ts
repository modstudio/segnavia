import { sameValue } from './board-op-equal.ts'
import { Document, type Document as DocumentValue } from './document.ts'

export function requireParsedDocument(document: DocumentValue, subject: string): DocumentValue {
  let parsed: DocumentValue
  try {
    parsed = Document.parse(document)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${subject} refused: document is not a parsed Document; parse it first to clear this refusal (${reason})`)
  }
  if (!sameValue(parsed, document)) throw new Error(`${subject} refused: document is not a parsed Document; parse it first to clear this refusal`)
  return document
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, held]) => held !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(',')}}`
}

export function fingerprintScript(): string {
  return `${canonical.toString()}
var canonical=${canonical.name};
${fingerprintValue.toString()}
var fingerprintValue=${fingerprintValue.name};`
}

export function fingerprintValue(value: unknown): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(canonical(value))) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}

export function fingerprintDocument(document: DocumentValue): string {
  const parsed = requireParsedDocument(document, 'fingerprintDocument')
  return fingerprintValue(parsed)
}
