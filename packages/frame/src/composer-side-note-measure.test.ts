import { expect, test } from 'bun:test'
import { measureSideNotes, sideNoteAnchorTop, sideNoteKind } from './composer-side-note-measure.ts'

test('side-note kind follows its structure rather than its blockified display', () => {
  const flow = {} as Element
  const block = { parentElement: flow }
  const inline = { parentElement: {} as Element }
  expect(sideNoteKind(block, flow)).toBe('block')
  expect(sideNoteKind(inline, flow)).toBe('inline')
})

test('block side notes use the immediately following block and inline notes use their containing line', () => {
  const first = { top: 10, bottom: 20 }
  const second = { top: 20, bottom: 30 }
  const held = [first, second]
  expect(
    sideNoteAnchorTop(
      'block',
      4,
      [],
      [
        {
          kind: 'heading',
          lines: [
            { ...first, counted: false },
            { ...second, counted: false },
          ],
        },
      ],
    ),
  ).toBe(10)
  expect(sideNoteAnchorTop('block', 4, [], [{ kind: 'figure', lines: [first] }])).toBe(10)
  expect(sideNoteAnchorTop('block', 4, [], [])).toBe(4)
  expect(sideNoteAnchorTop('inline', 24, held, [])).toBe(20)
  expect(sideNoteAnchorTop('inline', 18, held, [])).toBe(10)
  expect(sideNoteAnchorTop('inline', 40, held, [])).toBe(40)
})

test('records the anchor block direction independently from Hebrew note content', () => {
  const flow = { children: [] as Element[] } as unknown as Element
  const paragraph = { parentElement: flow } as unknown as Element
  const note = {
    parentElement: paragraph,
    getAttribute: (name: string) => (name === 'data-segnavia-id' ? 'hebrew' : null),
    getBoundingClientRect: () => ({ top: 15 }),
  } as unknown as Element
  ;(flow as unknown as { querySelectorAll: () => Element[] }).querySelectorAll = () => [note]
  ;(flow as unknown as { children: Element[] }).children = [paragraph]
  const previous = globalThis.getComputedStyle
  globalThis.getComputedStyle = ((element: Element) => ({ direction: element === paragraph ? 'ltr' : 'rtl' })) as typeof getComputedStyle
  try {
    expect(measureSideNotes(flow, [{ kind: 'text', lines: [{ top: 10, bottom: 20 }] }], [paragraph], 0)).toEqual([
      { id: 'hebrew', kind: 'inline', top: 10, direction: 'ltr' },
    ])
  } finally {
    globalThis.getComputedStyle = previous
  }
})
