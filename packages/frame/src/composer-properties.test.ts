import { expect, test } from 'bun:test'
import { MEASURE_KIND_MODEL } from '@segnavia/format'
import { graphemeInlineExtent, propertySources } from './composer-properties.ts'
import { embeddedComposerPropertyFunctions } from './composer-properties-embed.ts'

test('the embedded measurer table covers every measure kind', () => {
  const embeddedKinds = new Function(`${embeddedComposerPropertyFunctions()};return Object.keys(MEASURERS)`)() as string[]
  expect(embeddedKinds.sort()).toEqual(Object.keys(MEASURE_KIND_MODEL).sort())
})

test('a direct child without text contributes its own logical inline box', () => {
  const previous = globalThis.NodeFilter
  Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: { SHOW_TEXT: 4 } })
  try {
    const node = {
      nodeType: 1,
      ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) },
      getBoundingClientRect: () => ({ width: 72, height: 24 }),
    }
    expect(graphemeInlineExtent(node as unknown as Node, 'horizontal-tb')).toBe(72)
    expect(graphemeInlineExtent(node as unknown as Node, 'vertical-rl')).toBe(24)
  } finally {
    Object.defineProperty(globalThis, 'NodeFilter', { configurable: true, value: previous })
  }
})

test('a measured element without layout boxes refuses by block id', () => {
  const hidden = {
    closest: () => null,
    getAttribute: (name: string) => (name === 'data-segnavia-id' ? 'hidden-measure' : null),
    getClientRects: () => [],
  } as unknown as HTMLElement
  const root = {
    querySelectorAll: (selector: string) => (selector === '[data-measure]' ? [hidden] : []),
  } as unknown as ParentNode

  expect(() => propertySources(root, () => ({ paperWidth: 0, paperHeight: 0, parents: [] }), 'ltr', 'en', '[data-measure]')).toThrow(
    'data-measure on block "hidden-measure" has no layout boxes; make the element laid out or remove data-measure to clear this refusal',
  )
})

test('embedded template and designed-page staging each produce a property fact', () => {
  const element = (id: string, height: number) => ({
    closest: () => null,
    getAttribute: (name: string) => ({ 'data-measure': 'block', 'data-measure-as': `--${id}`, 'data-segnavia-id': id })[name] ?? null,
    getBoundingClientRect: () => ({ width: 20, height }),
    getClientRects: () => [{ width: 20, height }],
    style: { setProperty() {} },
  })
  const template = element('template-measure', 24)
  const designed = element('designed-measure', 36)
  const makeEntry = (held: ReturnType<typeof element>) => ({ clone: { remove() {} }, fitted: held, source: held })
  const run = new Function(
    'templateFits',
    'designedFits',
    'logicalExtent',
    'blockSubject',
    'stagedSourceExcluded',
    'getComputedStyle',
    `${embeddedComposerPropertyFunctions()};return measureSourcePropertiesImplementation`,
  )(
    () => [makeEntry(template)],
    () => [makeEntry(designed)],
    (rect: { width: number; height: number }, _writingMode: string, axis: string) => (axis === 'inline' ? rect.width : rect.height),
    (held: ReturnType<typeof element>) => held.getAttribute('data-segnavia-id') ?? '',
    () => false,
    () => ({ writingMode: 'horizontal-tb' }),
  ) as (root: ParentNode, geometry: () => unknown, direction: string, lang: string, lineBoxes: () => unknown[]) => unknown[]

  const facts = run(
    { querySelectorAll: () => [] } as unknown as ParentNode,
    () => ({}),
    'ltr',
    'en',
    () => [],
  )
  expect(facts).toEqual([
    { id: 'template-measure', name: '--template-measure', kind: 'block', value: 24, unit: 'px' },
    { id: 'designed-measure', name: '--designed-measure', kind: 'block', value: 36, unit: 'px' },
  ])
})
