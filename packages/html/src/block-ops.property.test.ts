import { expect, test } from 'bun:test'
import { applyOps, type Document, fingerprintDocument } from '@segnavia/format'
import { insertBlock, moveBlock, removeBlock, setBlock } from './block-ops.ts'
import { blockElements } from './block-view.ts'
import { parseDocument } from './document.ts'
import { parse, serialize } from './sanitize.ts'

const CASES = 200
const ORDINARY = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure'] as const

function property(name: string, body: (seed: number) => void): void {
  // vacuity-allow: every generated case executes assertions in the supplied property body
  test(name, () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      try {
        body(seed)
      } catch (error) {
        throw new Error(`${name} failed with seed ${seed}`, { cause: error })
      }
    }
  })
}

function source(seed: number): string {
  const kind = ORDINARY[seed % ORDINARY.length]
  const ordinary =
    kind === 'figure'
      ? `<figure data-segnavia-id="ordinary-a"><p data-segnavia-id="figure-p">Figure ${seed}</p></figure>`
      : `<${kind} data-segnavia-id="ordinary-a">Ordinary ${seed}</${kind}>`
  return (
    `${ordinary}<p data-segnavia-id="ordinary-b">Sibling ${seed}</p>` +
    `<ul><li data-segnavia-id="li-outer">Outer<ul><li data-segnavia-id="li-a">A ${seed}</li><li data-segnavia-id="li-b">B ${seed}</li></ul></li></ul>` +
    `<table><tbody><tr data-segnavia-id="tr-a"><td>Row A ${seed}</td></tr><tr data-segnavia-id="tr-b"><td>Row B ${seed}</td></tr></tbody></table>`
  )
}

function page(seed: number): Document {
  let next = 0
  return parseDocument(
    { type: 'document', kind: 'page', children: [{ type: 'page', body: { html: source(seed) } }] },
    { newId: () => `mint-${seed}-${++next}` },
  )
}

function html(document: Document): string {
  const body = document.children[0]?.type === 'page' ? document.children[0].body : undefined
  if (!body || !('html' in body)) throw new Error('page body is absent')
  return body.html
}

function serializedBlocks(document: Document): Map<string, string> {
  return new Map(blockElements(parse(html(document)).children).map((element) => [element.attribs['data-segnavia-id'] as string, serialize(element)]))
}

function related(document: Document, id: string): Set<string> {
  const elements = blockElements(parse(html(document)).children)
  const target = elements.find((element) => element.attribs['data-segnavia-id'] === id)
  if (!target) return new Set([id])
  const result = new Set([id, ...blockElements(target.children).map((element) => element.attribs['data-segnavia-id'] as string)])
  for (let parent = target.parent; parent; parent = parent.parent) {
    if ('attribs' in parent && parent.attribs['data-segnavia-id']) result.add(parent.attribs['data-segnavia-id'])
  }
  return result
}

function unchanged(before: Document, after: Document, except: ReadonlySet<string>): void {
  const oldBlocks = serializedBlocks(before)
  const nextBlocks = serializedBlocks(after)
  for (const [id, serialized] of oldBlocks) {
    if (!except.has(id)) expect(nextBlocks.get(id), `block ${id}`).toBe(serialized)
  }
}

function apply(document: Document, ops: ReturnType<typeof setBlock>): Document {
  return applyOps(document, { base: fingerprintDocument(document), ops })
}

function target(seed: number): { id: string; peer: string } {
  const choice = seed % 3
  if (choice === 0) return { id: 'ordinary-a', peer: 'ordinary-b' }
  if (choice === 1) return { id: 'li-a', peer: 'li-b' }
  return { id: 'tr-a', peer: 'tr-b' }
}

property('setBlock changes only the target block substring and its containing substrings', (seed) => {
  const before = page(seed)
  const { id } = target(seed)
  const change =
    seed % 3 === 0 && ORDINARY[seed % ORDINARY.length] !== 'figure'
      ? { kind: 'h1' as const }
      : seed % 3 === 1 || ORDINARY[seed % ORDINARY.length] === 'figure'
        ? { html: `<span>Changed ${seed}</span>` }
        : { class: `changed-${seed}` }
  const after = apply(before, setBlock(before, id, change))
  unchanged(before, after, related(before, id))
})

property('insertBlock preserves every existing block substring outside its containing block', (seed) => {
  const before = page(seed)
  const choice = seed % 3
  const input =
    choice === 0
      ? {
          html: `<${ORDINARY[(seed + 1) % ORDINARY.length]}>New ${seed}</${ORDINARY[(seed + 1) % ORDINARY.length]}>`,
          position: { after: 'ordinary-a' } as const,
        }
      : choice === 1
        ? { html: `<li>New ${seed}</li>`, position: { after: 'li-a' } as const }
        : { html: `<tr><td>New ${seed}</td></tr>`, position: { after: 'tr-a' } as const }
  const inserted = insertBlock(before, input, { newId: () => `new-${seed}` })
  const after = apply(before, inserted.ops)
  const except = choice === 1 ? new Set(['li-outer']) : new Set<string>()
  unchanged(before, after, except)
})

property('moveBlock preserves every moved and unaffected block serialization outside containing blocks', (seed) => {
  const before = page(seed)
  const { id, peer } = target(seed)
  const after = apply(before, moveBlock(before, id, { after: peer }))
  unchanged(before, after, related(before, id))
  expect(serializedBlocks(after).get(id)).toBe(serializedBlocks(before).get(id))
})

property('removeBlock preserves every remaining block substring outside its containing block', (seed) => {
  const before = page(seed)
  const { id } = target(seed)
  const excluded = related(before, id)
  const after = apply(before, removeBlock(before, id))
  unchanged(before, after, excluded)
})
