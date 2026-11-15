import { expect, test } from 'bun:test'
import type { ParagraphToken } from './composer-paragraph.ts'
import { contentInlineSize, paragraphComposerScript, paragraphMeasures, planParagraphLines, removeContinuationIds } from './composer-paragraph.ts'

function tokens(text: string, width = 5): ParagraphToken[] {
  return Array.from(text, (part) => ({ kind: /^\s$/u.test(part) ? 'space' : 'text', text: part, width }))
}

const base = { measure: 32, language: 'en-US', hyphenate: true, spacing: { minimum: 80, desired: 100, maximum: 133 } }

test('plans explicit lines and leaves a one-line paragraph as one line', () => {
  expect(planParagraphLines(tokens('one two three'), base).length).toBeGreaterThan(1)
  expect(planParagraphLines(tokens('one'), base)).toEqual([{ start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: false }])
})

test('plans a library hyphen marker but a maqaf break without one', () => {
  const english = planParagraphLines(tokens('hyphenation'), { ...base, measure: 24 }, 3)
  expect(english.some((line) => line.hyphen)).toBe(true)
  const hebrew = planParagraphLines(tokens('שלום־עליכם'), { ...base, language: 'he', measure: 28 }, 3)
  expect(hebrew.length).toBeGreaterThan(1)
  expect(hebrew.every((line) => !line.hyphen)).toBe(true)
})

test('keeps mixed-direction token order and embeds inline cloning and idempotence behavior', () => {
  const mixed = tokens('abc אבג def')
  const planned = planParagraphLines(mixed, base)
  expect(planned[0]?.start).toBe(0)
  expect(planned.at(-1)?.end).toBe(mixed.length)
  const script = paragraphComposerScript()
  expect(script).toContain('range.cloneContents()')
  expect(script).toContain('composedParagraphs.get(paragraph)')
  expect(script).toContain('style.textAlign !== "justify"')
  expect(script).toContain('composition.composer ?? "paragraph"')
  expect(script).toContain('lines.length <= 1')
  expect(script).toContain('data-segnavia-hyphen')
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
  expect(paragraphComposerScript()).toContain('span.style.textIndent = "0"')
})

test('plans br as a forced start-aligned break and counts an atomic inline box', () => {
  const forced: ParagraphToken[] = [...tokens('one'), { kind: 'forced', text: '', width: 0 }, ...tokens('two')]
  expect(planParagraphLines(forced, { ...base, measure: 100 })).toEqual([
    { start: 0, end: 3, wordSpacing: 0, hyphen: false, forced: true },
    { start: 4, end: 7, wordSpacing: 0, hyphen: false, forced: false },
  ])
  const withAtomic: ParagraphToken[] = [...tokens('one '), { kind: 'atomic', text: '', width: 30 }, ...tokens(' two')]
  expect(planParagraphLines(withAtomic, { ...base, measure: 35 }).length).toBeGreaterThan(planParagraphLines(tokens('one  two'), { ...base, measure: 35 }).length)
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

test('takes inherited language and direction from the paragraph environment', () => {
  const script = paragraphComposerScript()
  expect(script).toContain('paragraph.closest("[lang]")')
  expect(script).toContain('rewriteParagraph(paragraph, tokens, lines, doc, style.direction)')
  expect(script).not.toContain('resolveDirection')
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
            contents: `import { paragraphComposerScript } from ${JSON.stringify(`${import.meta.dir}/composer-paragraph.ts`)}; export const script=paragraphComposerScript();`,
            loader: 'ts',
          }))
        },
      },
    ],
  })
  expect(built.success).toBe(true)
  const bundle = await built.outputs[0]?.text()
  const script = new Function('module', 'exports', `${bundle};return module.exports.script`)({ exports: {} }, {}) as string
  const compose = new Function(`${script};return composeParagraphs`)() as (...args: unknown[]) => void
  expect(typeof compose).toBe('function')
  const paragraph = { getBoundingClientRect: () => ({ width: 100, height: 20 }) }
  const style = { textAlign: 'start', writingMode: 'horizontal-tb', getPropertyValue: () => '' }
  expect(() => compose({ querySelectorAll: () => [paragraph] }, {}, () => style, 4, new WeakMap())).not.toThrow()
})
