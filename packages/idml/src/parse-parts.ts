import { type AnyNode, type Document, type Element, isTag } from 'domhandler'
import { Parser, parseDocument } from 'htmlparser2'
import type { IdmlLimits } from './limits.ts'
import { refusal } from './refusal.ts'
import type { ZipEntry } from './zip.ts'

export interface ParsedPart {
  name: string
  document: Document
  all: Element[]
}

function allElements(root: Document): Element[] {
  const found: Element[] = []
  const pending: (AnyNode | Document)[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node) continue
    if (isTag(node)) found.push(node)
    if ('children' in node) for (const child of [...node.children].reverse()) pending.push(child as AnyNode)
  }
  return found
}

function checkDepth(source: string, part: string, limit: number): void {
  let depth = 0
  const parser = new Parser(
    {
      onopentag() {
        depth += 1
        if (depth > limit) throw refusal(`IDML XML part ${part} exceeds the ${limit} level XML depth limit`, `reduce its nesting to ${limit} levels or fewer`)
      },
      onclosetag() {
        depth -= 1
      },
    },
    { xmlMode: true, recognizeSelfClosing: true },
  )
  parser.end(source)
}

export function parseParts(entries: ZipEntry[], limits: IdmlLimits): ParsedPart[] {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  return entries
    .filter((entry) => entry.name.toLowerCase().endsWith('.xml'))
    .map((entry) => {
      let source: string
      try {
        source = decoder.decode(entry.bytes)
      } catch {
        throw refusal(`IDML XML part ${entry.name} is not valid UTF-8`, 'export that XML part as UTF-8')
      }
      let document: Document
      try {
        checkDepth(source, entry.name, limits.xmlDepth)
        document = parseDocument(source, { xmlMode: true, recognizeSelfClosing: true })
      } catch (error) {
        if (error instanceof Error && error.message.includes('XML depth limit')) throw error
        throw refusal(`IDML XML part ${entry.name} could not be parsed: ${String(error)}`, 'export well-formed XML')
      }
      const all = allElements(document)
      if (all.length === 0) throw refusal(`IDML XML part ${entry.name} has no root element`, 'export a non-empty well-formed XML part')
      return { name: entry.name, document, all }
    })
}
