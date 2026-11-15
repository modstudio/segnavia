import { expect, test } from 'bun:test'
import type { ParagraphToken } from './composer-paragraph.ts'
import {
  paragraphBaseDirection,
  paragraphCompositionAction,
  paragraphMeasures,
  planParagraphLines,
  resolvedTextIndent,
  setParagraphVariableValue,
} from './composer-paragraph.ts'
import { contentInlineSize } from './composer-paragraph-box.ts'
import {
  COMPOSITION_CONTINUATION_ATTRIBUTE,
  COMPOSITION_IDENTITY_ATTRIBUTE,
  lineFragment,
  markCompositionContinuations,
  removeContinuationIds,
} from './composer-paragraph-dom.ts'
import { appendTextTokens } from './composer-paragraph-measure.ts'

function tokens(text: string, width = 5): ParagraphToken[] {
  return Array.from(text, (part) => ({ kind: /^\s$/u.test(part) ? 'space' : 'text', text: part, width }))
}

const base = { measure: 32, language: 'en-US', hyphenate: true, spacing: { minimum: 80, desired: 100, maximum: 133 } }

test('plans explicit lines and leaves a one-line paragraph as one line', () => {
  expect(planParagraphLines(tokens('one two three'), base).length).toBeGreaterThan(1)
  expect(planParagraphLines(tokens('one'), base)).toEqual([{ start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: false }])
  const short = planParagraphLines(tokens('one two three'), { ...base, measure: 100 })
  expect(short).toHaveLength(1)
  expect(short[0]?.end).toBe(13)
})

test('plans a library hyphen marker but a maqaf break without one', () => {
  const english = planParagraphLines(tokens('hyphenation'), { ...base, measure: 24 }, 3)
  expect(english.some((line) => line.hyphen)).toBe(true)
  const hebrew = planParagraphLines(tokens('שלום־עליכם'), { ...base, language: 'he', measure: 28 }, 3)
  expect(hebrew.length).toBeGreaterThan(1)
  expect(hebrew.every((line) => !line.hyphen)).toBe(true)
})

test('subtracts inline-axis padding and borders from the border box', () => {
  const horizontal = {
    writingMode: 'horizontal-tb',
    paddingLeft: '7px',
    paddingRight: '11px',
    paddingTop: '13px',
    paddingBottom: '17px',
    borderLeftWidth: '2px',
    borderRightWidth: '3px',
    borderTopWidth: '5px',
    borderBottomWidth: '6px',
  } as CSSStyleDeclaration
  expect(contentInlineSize({ width: 100, height: 200 }, horizontal)).toBe(77)
  expect(contentInlineSize({ width: 100, height: 200 }, { ...horizontal, writingMode: 'vertical-rl' })).toBe(159)
})

test('uses the indented first-line measure for positive and hanging indents', () => {
  expect(paragraphMeasures(100, 12)).toEqual([88, 100])
  expect(paragraphMeasures(100, -12)).toEqual([112, 100])
  const plain = planParagraphLines(tokens('one two three'), { ...base, measure: 38 })
  const indented = planParagraphLines(tokens('one two three'), { ...base, measure: 38, indent: 12 })
  expect(indented[0]?.end).toBeLessThan(plain[0]?.end ?? 0)
})

test('plans br as a forced start-aligned break and counts an atomic inline box', () => {
  const forced: ParagraphToken[] = [...tokens('one'), { kind: 'forced', text: '', width: 0 }, ...tokens('two')]
  expect(planParagraphLines(forced, { ...base, measure: 100 })).toEqual([
    { start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: true },
    { start: 4, end: 7, wordSpacing: 0, hyphen: false, forced: false },
  ])
  const withAtomic: ParagraphToken[] = [...tokens('one '), { kind: 'atomic', text: '', width: 30 }, ...tokens(' two')]
  expect(planParagraphLines(withAtomic, { ...base, measure: 35 }).length).toBeGreaterThan(
    planParagraphLines(tokens('one  two'), { ...base, measure: 35 }).length,
  )
})

test('hyphenates a word after a forced break', () => {
  const forced: ParagraphToken[] = [
    ...tokens('one two'),
    { kind: 'forced', text: '', width: 0 },
    { kind: 'space', text: ' ', width: 5 },
    ...tokens('hyphenation'),
  ]
  const planned = planParagraphLines(forced, { ...base, measure: 32 }, 3)
  expect(planned.slice(1).some((line) => line.hyphen)).toBe(true)
})

test('keeps hyphen breaks for a last word after several forced breaks', () => {
  const word = tokens('hyphenation')
  const direct = planParagraphLines(word, { ...base, measure: 24 }, 3)
  const prefix: ParagraphToken[] = Array.from({ length: 3 }, () => ({ kind: 'forced', text: '', width: 0 }))
  const afterBreaks = planParagraphLines([...prefix, ...word], { ...base, measure: 24 }, 3)
    .filter((line) => line.start >= prefix.length)
    .map((line) => ({ ...line, start: line.start - prefix.length, end: line.end - prefix.length }))
  expect(afterBreaks).toEqual(direct)
})

test('keeps every break space in the planned line ranges', () => {
  const held = tokens('one two three')
  const planned = planParagraphLines(held, base)
  expect(planned.flatMap((line) => held.slice(line.start, line.end))).toEqual(held)
})

test('builds a plain-text line without cloning a DOM range', () => {
  const appended: unknown[] = []
  const text = { nodeType: 3, data: 'one two' } as Text
  const doc = {
    createDocumentFragment: () => ({ append: (node: unknown) => appended.push(node) }),
    createTextNode: (data: string) => ({ data }),
    createRange: () => {
      throw new Error('plain text should not create a range')
    },
  } as unknown as Document
  lineFragment(
    [
      { kind: 'text', text: 'n', width: 1, node: text, start: 1, end: 2 },
      { kind: 'text', text: 'e', width: 1, node: text, start: 2, end: 3 },
      { kind: 'space', text: ' ', width: 1, node: text, start: 3, end: 4 },
    ],
    { start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: false },
    doc,
  )
  expect(appended).toEqual([{ data: 'ne ' }])
})

test('decides restore and recompose without retaining a stale size', () => {
  expect(paragraphCompositionAction(undefined, 100, 'justify', 'paragraph', 2)).toBe('compose')
  expect(paragraphCompositionAction(100, 100, 'justify', 'paragraph', 2)).toBe('skip')
  expect(paragraphCompositionAction(100, 80, 'justify', 'paragraph', 1)).toBe('restore')
  expect(paragraphCompositionAction(undefined, 100, 'justify', 'paragraph', 2)).toBe('compose')
  expect(paragraphCompositionAction(100, 80, 'start', 'paragraph', 2)).toBe('restore')
  expect(paragraphCompositionAction(undefined, 80, 'justify', 'single-line', 2)).toBe('leave')
})

test('resolves one paragraph base direction for all of its lines', () => {
  expect(paragraphBaseDirection('rtl', 'normal', 'English', 'ltr')).toBe('rtl')
  for (const pageDirection of ['ltr', 'rtl'] as const) {
    expect(paragraphBaseDirection(null, 'plaintext', 'שלום English', pageDirection)).toBe('rtl')
    expect(paragraphBaseDirection(null, 'plaintext', 'English שלום', pageDirection)).toBe('ltr')
    expect(paragraphBaseDirection(null, 'plaintext', '123 —', pageDirection)).toBe(pageDirection)
  }
  expect(paragraphBaseDirection(null, 'normal', 'שלום', 'ltr')).toBe('ltr')
  expect(paragraphBaseDirection(null, 'normal', 'English', 'rtl')).toBe('rtl')
})

test('removes an id from continuation clones only', () => {
  const elements = [{ id: 'chapter' }, { id: 'chapter' }, { id: 'note' }]
  const fragments = elements.map((held) => ({
    querySelectorAll: () => [
      {
        getAttribute: () => held.id,
        removeAttribute: () => {
          held.id = ''
        },
      },
    ],
  })) as unknown as ParentNode[]
  removeContinuationIds(fragments)
  expect(elements.map((held) => held.id)).toEqual(['chapter', '', 'note'])
})

test('marks continuation identities while keeping the first clone authoritative', () => {
  const attributes = [
    new Map([
      ['data-segnavia-composition-identity', '4'],
      ['data-segnavia-composition-variable-value', 'whole value'],
    ]),
    new Map([['data-segnavia-composition-identity', '4']]),
  ]
  const fragments = attributes.map((held) => ({
    querySelectorAll: () => [
      {
        getAttribute: (name: string) => held.get(name) ?? null,
        removeAttribute: (name: string) => held.delete(name),
        setAttribute: (name: string, value: string) => held.set(name, value),
      },
    ],
  })) as unknown as ParentNode[]
  markCompositionContinuations(fragments, COMPOSITION_IDENTITY_ATTRIBUTE, COMPOSITION_CONTINUATION_ATTRIBUTE)
  expect(attributes[0]?.get('data-segnavia-composition-variable-value')).toBe('whole value')
  expect(attributes[0]?.has('data-segnavia-composition-continuation')).toBe(false)
  expect(attributes[1]?.has('data-segnavia-composition-continuation')).toBe(true)
})

test('keeps embedded paragraph function names after minification', async () => {
  const built = await Bun.build({
    entrypoints: ['virtual:paragraph-composer'],
    minify: true,
    target: 'browser',
    conditions: ['@segnavia/source'],
    format: 'cjs',
    plugins: [
      {
        name: 'paragraph-composer',
        setup(builder) {
          builder.onResolve({ filter: /^virtual:paragraph-composer$/ }, () => ({ path: 'paragraph-composer', namespace: 'virtual' }))
          builder.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
            contents: `import { layoutScript } from ${JSON.stringify(new URL(import.meta.resolve('@segnavia/layout')).pathname)}; import { paragraphComposerScript } from ${JSON.stringify(`${import.meta.dir}/composer-paragraph.ts`)}; export const script=layoutScript()+paragraphComposerScript();`,
            loader: 'ts',
          }))
        },
      },
    ],
  })
  expect(built.success).toBe(true)
  const bundle = await built.outputs[0]?.text()
  const script = new Function('module', 'exports', `${bundle};return module.exports.script`)({ exports: {} }, {}) as string
  const embedded = new Function(`${script};return {breakLines,hyphenationPoints,planParagraphLinesWith,composeParagraphs}`)() as {
    breakLines: unknown
    hyphenationPoints: unknown
    planParagraphLinesWith: unknown
    composeParagraphs: (...args: unknown[]) => void
  }
  const compose = embedded.composeParagraphs
  expect(typeof embedded.breakLines).toBe('function')
  expect(typeof embedded.hyphenationPoints).toBe('function')
  expect(typeof embedded.planParagraphLinesWith).toBe('function')
  expect(typeof compose).toBe('function')
  const paragraph = { getBoundingClientRect: () => ({ width: 100, height: 20 }) }
  const style = { textAlign: 'start', writingMode: 'horizontal-tb', getPropertyValue: () => '' }
  expect(() =>
    compose(
      { querySelectorAll: () => [paragraph] },
      {},
      () => style,
      new WeakMap(),
      undefined,
      undefined,
      undefined,
      undefined,
      (rect: { width: number }) => rect.width,
    ),
  ).not.toThrow()
})

test('classifies collapsible, non-breaking and zero-width spaces for line planning', () => {
  const classify = (text: string) => {
    const node = { data: text, parentElement: {} } as Text
    const doc = {
      createRange: () => ({ setStart: () => undefined, setEnd: () => undefined, getBoundingClientRect: () => ({ width: 5, height: 9 }) }),
    } as unknown as Document
    const held: ParagraphToken[] = []
    appendTextTokens(
      node,
      held,
      new Map(),
      doc,
      () => ({ font: '', fontKerning: '', fontFeatureSettings: '', fontVariationSettings: '', letterSpacing: '', textTransform: '' }) as CSSStyleDeclaration,
      'horizontal-tb',
    )
    return held
  }
  for (const character of [' ', '\t', '\n', '\f', '\r']) expect(classify(character)[0]?.kind).toBe('space')
  for (const character of ['\u00a0', '\u2007', '\u202f', '\ufeff', '\u2060']) {
    const held = [...tokens('10'), ...classify(character), ...tokens('kg')]
    expect(held[2]?.kind).toBe('text')
    expect(planParagraphLines(held, { ...base, measure: 12 })).toHaveLength(1)
  }
  const zeroWidth = [...tokens('one'), ...classify('\u200b'), ...tokens('two')]
  expect(zeroWidth[3]).toMatchObject({ kind: 'space', width: 0 })
  expect(planParagraphLines(zeroWidth, { ...base, measure: 16 }).length).toBeGreaterThan(1)
})

test('keeps browser line boxes for leading and consecutive br but not a trailing br', () => {
  const br = (): ParagraphToken => ({ kind: 'forced', text: '', width: 0 })
  expect(planParagraphLines([br(), ...tokens('one')], { ...base, measure: 100 })).toEqual([
    { start: 0, end: 0, wordSpacing: 0, hyphen: false, forced: true, blank: true },
    { start: 1, end: 4, wordSpacing: 0, hyphen: false, forced: false },
  ])
  expect(planParagraphLines([...tokens('one'), br(), br(), ...tokens('two')], { ...base, measure: 100 })).toEqual([
    { start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: true },
    { start: 4, end: 4, wordSpacing: 0, hyphen: false, forced: true, blank: true },
    { start: 5, end: 8, wordSpacing: 0, hyphen: false, forced: false },
  ])
  expect(planParagraphLines([...tokens('one'), br()], { ...base, measure: 100 })).toEqual([{ start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: true }])
  const appended: unknown[] = []
  const doc = {
    createDocumentFragment: () => ({ append: (node: unknown) => appended.push(node) }),
    createElement: (name: string) => ({ name }),
  } as unknown as Document
  lineFragment([], { start: 0, end: 0, wordSpacing: 0, hyphen: false, forced: true, blank: true }, doc)
  expect(appended).toEqual([{ name: 'br' }])
})

test('resolves percentage text indent against the content measure', () => {
  expect(resolvedTextIndent('12.5%', 240)).toBe(30)
  expect(resolvedTextIndent('-10%', 240)).toBe(-24)
  expect(resolvedTextIndent('18px', 240)).toBe(18)
})

test('uses the shared first-strong direction for weak digits and historic RTL scripts', () => {
  expect(paragraphBaseDirection(null, 'plaintext', '١ English', 'rtl')).toBe('ltr')
  expect(paragraphBaseDirection(null, 'plaintext', '𐤀 English', 'ltr')).toBe('rtl')
})

test('sets the authored value on a reused variable paragraph', () => {
  const attributes = new Map<string, string>([['data-variable', 'title']])
  const paragraph = {
    textContent: 'full variable value',
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  } as unknown as Element
  setParagraphVariableValue(paragraph, 'data-segnavia-composition-variable-value')
  expect(attributes.get('data-segnavia-composition-variable-value')).toBe('full variable value')
})

test('separates horizontal and sideways token widths in the measurement cache', () => {
  const node = { data: 'a', parentElement: {} } as Text
  const cache = new Map<string, number>()
  const doc = {
    createRange: () => ({ setStart: () => undefined, setEnd: () => undefined, getBoundingClientRect: () => ({ width: 3, height: 7 }) }),
  } as unknown as Document
  const styleFor = () =>
    ({ font: '', fontKerning: '', fontFeatureSettings: '', fontVariationSettings: '', letterSpacing: '', textTransform: '' }) as CSSStyleDeclaration
  const horizontal: ParagraphToken[] = []
  const sideways: ParagraphToken[] = []
  appendTextTokens(node, horizontal, cache, doc, styleFor, 'horizontal-tb')
  appendTextTokens(node, sideways, cache, doc, styleFor, 'sideways-rl')
  expect([horizontal[0]?.width, sideways[0]?.width]).toEqual([3, 7])
})
