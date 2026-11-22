import { expect, test } from 'bun:test'
import { lineNumberedLines, measuredBlockConstraints, measureLineBoxes } from './composer-measure.ts'

test('a display table element carries no orphan or widow constraint', () => {
  expect(measuredBlockConstraints('table', 2, 2)).toEqual({})
  expect(measuredBlockConstraints('block', 2, 3)).toEqual({ orphans: 2, widows: 3 })
})

function measuredElement(options: {
  tag?: string
  box?: { top: number; bottom: number; height: number }
  range?: Array<{ top: number; bottom: number }>
  tables?: unknown[]
}) {
  const box = options.box ?? { top: 10, bottom: 20, height: 10 }
  const childNodes = options.range ? [{ rects: options.range }] : []
  const document = {
    createRange: () => {
      let selected = childNodes
      return {
        selectNodeContents: () => {
          selected = childNodes
        },
        setStart: (_node: unknown, start: number) => {
          selected = childNodes.slice(start)
        },
        setEnd: (_node: unknown, end: number) => {
          selected = childNodes.slice(0, end)
        },
        getClientRects: () => selected.flatMap((child) => child.rects),
      }
    },
  }
  return {
    tagName: options.tag ?? 'DIV',
    childNodes,
    ownerDocument: document,
    closest: () => null,
    querySelectorAll: (selector: string) => (selector === 'table' ? (options.tables ?? []) : []),
    getBoundingClientRect: () => box,
  }
}

interface NestedMeasuredLeaf {
  rects: Array<{ top: number; bottom: number }>
}

interface NestedMeasuredElement {
  tagName: string
  childNodes: NestedMeasuredNode[]
  parentElement: NestedMeasuredElement | null
  ownerDocument: unknown
  dataSideNote?: boolean
  closest: (selector: string) => NestedMeasuredElement | null
  querySelectorAll: (selector: string) => NestedMeasuredElement[]
  getBoundingClientRect: () => { top: number; bottom: number; height: number }
  rects?: Array<{ top: number; bottom: number }>
}

type NestedMeasuredNode = NestedMeasuredElement | NestedMeasuredLeaf

function nestedMeasuredElement(
  tag: string,
  children: NestedMeasuredNode[],
  options: { dataSideNote?: boolean; rects?: Array<{ top: number; bottom: number }> } = {},
): NestedMeasuredElement {
  const element = {
    tagName: tag.toUpperCase(),
    childNodes: children,
    parentElement: null,
    ownerDocument: null,
    dataSideNote: options.dataSideNote,
    closest: (selector: string): NestedMeasuredElement | null => {
      if (selector !== '[data-side-note]') return null
      if (element.dataSideNote) return element
      return (element.parentElement as NestedMeasuredElement | null)?.closest(selector) ?? null
    },
    querySelectorAll: (selector: string) => {
      if (selector === ':scope > span[data-segnavia-line]') return []
      if (selector === '[data-side-note]')
        return children.flatMap((child) => {
          if (!('tagName' in child)) return []
          return [...(child.dataSideNote ? [child] : []), ...child.querySelectorAll(selector)]
        })
      if (selector === 'table')
        return children.flatMap((child) => {
          if (!('tagName' in child)) return []
          return child.tagName === 'TABLE' ? [child] : child.querySelectorAll(selector)
        })
      return []
    },
    getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
    rects: options.rects,
  }
  for (const child of children) if ('tagName' in child) child.parentElement = element
  return element
}

function measureNested(element: NestedMeasuredElement): MeasuredLineBox[] {
  const document = {
    createRange: () => {
      let selected: unknown
      return {
        selectNodeContents: (node: unknown) => {
          selected = node
        },
        selectNode: (node: unknown) => {
          selected = node
        },
        setStart: (node: unknown, start: number) => {
          selected = { node, start }
        },
        setStartAfter: (node: NestedMeasuredElement) => {
          const parent = node.parentElement
          selected = { node: parent, start: parent ? parent.childNodes.indexOf(node) + 1 : 0 }
        },
        setEndBefore: (node: NestedMeasuredElement) => {
          const parent = node.parentElement
          const start = selected && typeof selected === 'object' && 'start' in selected ? Number(selected.start) : 0
          selected = { childNodes: parent?.childNodes.slice(start, parent.childNodes.indexOf(node)) ?? [] }
        },
        setEnd: (node: unknown, end: number) => {
          const start = selected && typeof selected === 'object' && 'start' in selected ? Number(selected.start) : 0
          selected = { childNodes: (node as { childNodes: unknown[] }).childNodes.slice(start, end) }
        },
        getClientRects: () => {
          if (selected && typeof selected === 'object' && 'rects' in selected) return selected.rects
          if (selected && typeof selected === 'object' && 'childNodes' in selected)
            return (selected.childNodes as NestedMeasuredNode[]).flatMap((child) => child.rects ?? [])
          return []
        },
      }
    },
  }
  const attach = (node: NestedMeasuredElement) => {
    node.ownerDocument = document
    for (const child of node.childNodes) if ('tagName' in child) attach(child)
  }
  attach(element)
  return measureLineBoxes(element as unknown as Element, 0)
}

type MeasuredLineBox = ReturnType<typeof measureLineBoxes>[number]

test.each([
  [
    'article > ul',
    nestedMeasuredElement('article', [
      nestedMeasuredElement('ul', [
        {
          rects: [
            { top: 10, bottom: 20 },
            { top: 20, bottom: 30 },
          ],
        },
      ]),
    ]),
  ],
  [
    'div > div > p',
    nestedMeasuredElement('div', [
      nestedMeasuredElement('div', [
        nestedMeasuredElement('p', [
          {
            rects: [
              { top: 10, bottom: 20 },
              { top: 20, bottom: 30 },
            ],
          },
        ]),
      ]),
    ]),
  ],
  [
    'blockquote > ul',
    nestedMeasuredElement('blockquote', [
      nestedMeasuredElement('ul', [
        {
          rects: [
            { top: 10, bottom: 20 },
            { top: 20, bottom: 30 },
          ],
        },
      ]),
    ]),
  ],
  [
    'article > ol',
    nestedMeasuredElement('article', [
      nestedMeasuredElement('ol', [
        {
          rects: [
            { top: 10, bottom: 20 },
            { top: 20, bottom: 30 },
          ],
        },
      ]),
    ]),
  ],
])('%s measures one line per nested item', (_name, element) => {
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureNested(element)).toEqual([
      { top: 10, bottom: 20 },
      { top: 20, bottom: 30 },
    ])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('inline text before a block child keeps its line before the child lines', () => {
  const text = { rects: [{ top: 10, bottom: 20 }] }
  const child = nestedMeasuredElement('div', [
    {
      rects: [
        { top: 30, bottom: 40 },
        { top: 40, bottom: 50 },
      ],
    },
  ])
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureNested(nestedMeasuredElement('article', [text, child]))).toEqual([
      { top: 10, bottom: 20 },
      { top: 30, bottom: 40 },
      { top: 40, bottom: 50 },
    ])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a block-display side note does not add its line to the containing block', () => {
  const text = { rects: [{ top: 10, bottom: 20 }] }
  const note = nestedMeasuredElement('aside', [{ rects: [{ top: 30, bottom: 40 }] }], { dataSideNote: true })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureNested(nestedMeasuredElement('p', [text, note]))).toEqual([{ top: 10, bottom: 20 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a nested side note leaves each recursive sibling paragraph measured once', () => {
  const first = nestedMeasuredElement('p', [{ rects: [{ top: 10, bottom: 20 }] }], { rects: [{ top: 8, bottom: 20 }] })
  const note = nestedMeasuredElement('aside', [{ rects: [{ top: 30, bottom: 40 }] }], { dataSideNote: true })
  const second = nestedMeasuredElement('p', [{ rects: [{ top: 50, bottom: 60 }] }], { rects: [{ top: 48, bottom: 60 }] })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureNested(nestedMeasuredElement('article', [nestedMeasuredElement('div', [first, note, second])]))).toEqual([
      { top: 10, bottom: 20 },
      { top: 50, bottom: 60 },
    ])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('ruby annotation does not add a line unit to its paragraph', () => {
  const annotation = nestedMeasuredElement('rt', [{ rects: [{ top: 2, bottom: 8 }] }])
  const ruby = nestedMeasuredElement('ruby', [annotation], { rects: [{ top: 10, bottom: 20 }] })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((candidate: Element) => {
    const tag = candidate.tagName.toLowerCase()
    return { display: tag === 'ruby' ? 'ruby' : tag === 'rt' ? 'ruby-text' : 'block', position: 'static' } as CSSStyleDeclaration
  }) as typeof getComputedStyle
  try {
    expect(measureNested(nestedMeasuredElement('p', [ruby]))).toEqual([{ top: 10, bottom: 20 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('an image inside a wrapper remains one replaced box', () => {
  const image = nestedMeasuredElement('img', [{ rects: [{ top: 10, bottom: 80 }] }])
  ;(image as unknown as { rects: Array<{ top: number; bottom: number }> }).rects = [{ top: 10, bottom: 80 }]
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureNested(nestedMeasuredElement('article', [image]))).toEqual([{ top: 10, bottom: 80 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a hidden descendant table does not change its block lines', () => {
  const hiddenTable = {
    tagName: 'TABLE',
    parentElement: null,
    closest: () => null,
    getClientRects: () => [],
  }
  const plain = measuredElement({ range: [{ top: 12, bottom: 18 }] })
  const withHiddenTable = measuredElement({ range: [{ top: 12, bottom: 18 }], tables: [hiddenTable] })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((element: Element) =>
    ({ display: element === (hiddenTable as unknown as Element) ? 'none' : 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(withHiddenTable as unknown as Element, 0)).toEqual(measureLineBoxes(plain as unknown as Element, 0))
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a composed paragraph measures each authored line span once', () => {
  const lines = [{ getBoundingClientRect: () => ({ top: 13, bottom: 37 }) }, { getBoundingClientRect: () => ({ top: 37, bottom: 61 }) }]
  const paragraph = measuredElement({
    range: [
      { top: 13, bottom: 37 },
      { top: 16, bottom: 34 },
      { top: 37, bottom: 61 },
      { top: 40, bottom: 58 },
    ],
  })
  paragraph.querySelectorAll = (selector: string) => (selector === ':scope > span[data-segnavia-line]' ? lines : [])
  expect(measureLineBoxes(paragraph as unknown as Element, 10)).toEqual([
    { top: 3, bottom: 27 },
    { top: 27, bottom: 51 },
  ])
})

test('a figure without an in-flow table keeps its replaced box', () => {
  const figure = measuredElement({ tag: 'FIGURE', box: { top: 10, bottom: 80, height: 70 } })
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(figure as unknown as Element, 0)).toEqual([{ top: 10, bottom: 80 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a figure with an in-flow table uses the table row bands', () => {
  const row = {
    closest: () => table,
    getBoundingClientRect: () => ({ top: 20, bottom: 60 }),
    querySelectorAll: () => [],
  }
  const table = {
    tagName: 'TABLE',
    parentElement: null as unknown,
    closest: () => null,
    ownerDocument: {},
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ top: 20, bottom: 60 }),
    querySelectorAll: (selector: string) => (selector === 'tr' ? [row] : []),
  }
  const figure = measuredElement({ tag: 'FIGURE', box: { top: 10, bottom: 80, height: 70 }, range: [{ top: 20, bottom: 60 }], tables: [table] })
  table.parentElement = figure
  const original = globalThis.getComputedStyle
  globalThis.getComputedStyle = (() => ({ display: 'block', position: 'static' }) as CSSStyleDeclaration) as typeof getComputedStyle
  try {
    expect(measureLineBoxes(figure as unknown as Element, 0)).toEqual([{ top: 20, bottom: 60 }])
  } finally {
    globalThis.getComputedStyle = original
  }
})

test('a numbered container marks heading lines as uncounted while keeping paragraph lines counted', () => {
  const heading = { closest: () => null, getBoundingClientRect: () => ({ top: 10, bottom: 20 }) }
  const ranges = new Map<unknown, Array<{ top: number; bottom: number }>>([[heading, [{ top: 10, bottom: 20 }]]])
  let selected: unknown
  const element = {
    ownerDocument: {
      createRange: () => ({
        selectNodeContents: (candidate: unknown) => {
          selected = candidate
        },
        getClientRects: () => ranges.get(selected) ?? [],
      }),
    },
    querySelectorAll: () => [heading],
  }
  expect(
    lineNumberedLines(
      [
        { top: 10, bottom: 20 },
        { top: 20, bottom: 30 },
      ],
      element as unknown as Element,
      0,
    ),
  ).toEqual([
    { top: 10, bottom: 20, counted: false },
    { top: 20, bottom: 30 },
  ])
})
