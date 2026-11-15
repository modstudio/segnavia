import { expect, test } from 'bun:test'
import type { ParagraphToken } from './composer-paragraph.ts'
import { paragraphComposerScript, planParagraphLines } from './composer-paragraph.ts'

function tokens(text: string, width = 5): ParagraphToken[] {
  return Array.from(text, (part) => ({ kind: /^\s$/u.test(part) ? 'space' : 'text', text: part, width }))
}

const base = { measure: 32, language: 'en-US', hyphenate: true, spacing: { minimum: 80, desired: 100, maximum: 133 } }

test('plans explicit lines and leaves a one-line paragraph as one line', () => {
  expect(planParagraphLines(tokens('one two three'), base).length).toBeGreaterThan(1)
  expect(planParagraphLines(tokens('one'), base)).toEqual([{ start: 0, end: 3, wordSpacing: 0, hyphen: false }])
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
  expect(new Function(`${script};return typeof composeParagraphs`)()).toBe('function')
})
