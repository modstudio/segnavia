import type { Locator } from 'playwright-core'
import { center, drag, waitChanges } from './board-editing-actions.ts'
import type { Harness } from './harness.ts'

interface DemoItem {
  id: string
  x: number
  y: number
  width: number
}
interface DemoSection {
  id: string
  rectangle: { x: number; y: number; width: number; height: number }
  items: string[]
}
interface DemoBoard {
  direction: 'ltr' | 'rtl'
  items: DemoItem[]
  sections: DemoSection[]
}
interface DemoChange {
  board: DemoBoard
  edit: { kind: string }
}
type BoardElement = HTMLElement & { board: DemoBoard; selection: readonly string[] }
type DemoWindow = typeof window & { boardChanges: DemoChange[] }

function sectionState(element: Element) {
  const board = (element as BoardElement).board
  const section = board.sections.find((entry) => entry.id === 'section') as DemoSection
  const hebrew = board.items.find((item) => item.id === 'deck-hebrew') as DemoItem
  const small = board.items.find((item) => item.id === 'deck-small') as DemoItem
  return { section: structuredClone(section), hebrew: structuredClone(hebrew), small: structuredClone(small) }
}

export async function checkBoardEditingSections(
  h: Harness,
  board: Locator,
  first: Locator,
  second: Locator,
  reset: (direction?: 'ltr' | 'rtl') => Promise<void>,
) {
  await reset()
  const original = await board.evaluate(sectionState)
  await drag(h.page, await center(second), 0, 350)
  await waitChanges(h.page, 1)
  const outside = await board.evaluate(sectionState)
  h.check(
    'dragging the Hebrew deck out removes it and shrinks Two decks around its remaining member',
    outside.section.items.join() === 'deck-small' &&
      outside.section.rectangle.width < original.section.rectangle.width &&
      outside.section.rectangle.height < original.section.rectangle.height,
    JSON.stringify({ original, outside }),
  )

  const outsideValue = structuredClone(outside)
  const from = await center(second)
  const to = await center(first)
  await drag(h.page, from, to.x - from.x, to.y - from.y)
  await waitChanges(h.page, 2)
  const joined = await board.evaluate(sectionState)
  h.check(
    'dragging the Hebrew deck back into Two decks appends it and grows the section',
    joined.section.items.join() === 'deck-small,deck-hebrew' &&
      joined.section.rectangle.width > outside.section.rectangle.width &&
      joined.section.rectangle.height > outside.section.rectangle.height,
    JSON.stringify({ outside, joined }),
  )

  await h.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z')
  await waitChanges(h.page, 3)
  const undone = await board.evaluate(sectionState)
  h.check(
    'one undo restores the dragged position, fitted rectangle and membership together',
    JSON.stringify(undone) === JSON.stringify(outsideValue),
    JSON.stringify({ outsideValue, undone }),
  )

  await reset()
  await second.click()
  const pageBefore = await board.evaluate((element) => {
    const value = (element as BoardElement).board
    return structuredClone(value.items.find((item) => item.id === 'page') as DemoItem)
  })
  const handle = board.locator('[part~="resize-handle"][data-corner="bottom-right"]')
  await drag(h.page, await center(handle), 160, 0)
  await waitChanges(h.page, 1)
  const room = await board.evaluate((element) => {
    const value = (element as BoardElement).board
    const section = value.sections.find((entry) => entry.id === 'section') as DemoSection
    const page = value.items.find((item) => item.id === 'page') as DemoItem
    const pageHeight = (page.width * 900) / 640
    const overlap =
      section.rectangle.x < page.x + page.width &&
      section.rectangle.x + section.rectangle.width > page.x &&
      section.rectangle.y < page.y + pageHeight &&
      section.rectangle.y + section.rectangle.height > page.y
    return { overlap, page: structuredClone(page), changes: (window as unknown as DemoWindow).boardChanges.length }
  })
  h.check(
    'growing Two decks toward the page nudges the page clear on the settled write',
    !room.overlap && (room.page.x !== pageBefore.x || room.page.y !== pageBefore.y) && room.changes === 1,
    JSON.stringify({ pageBefore, room }),
  )

  await reset('rtl')
  const rtlBefore = await board.evaluate(sectionState)
  await drag(h.page, await center(second), 0, 350)
  await waitChanges(h.page, 1)
  const rtlAfter = await board.evaluate(sectionState)
  h.check(
    'right-to-left section membership follows the same physical drop coordinates',
    rtlAfter.hebrew.y - rtlBefore.hebrew.y === 350 &&
      rtlAfter.section.items.join() === 'deck-small' &&
      rtlAfter.section.rectangle.width < rtlBefore.section.rectangle.width,
    JSON.stringify({ rtlBefore, rtlAfter }),
  )
}
