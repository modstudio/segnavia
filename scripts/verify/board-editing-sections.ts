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
interface DemoLabel {
  id: string
  text?: string
  x: number
  y: number
}
interface DemoBoard {
  direction: 'ltr' | 'rtl'
  items: DemoItem[]
  labels: DemoLabel[]
  sections: DemoSection[]
}
interface DemoChange {
  board: DemoBoard
  edit: { kind: string }
}
type BoardElement = HTMLElement & { board: DemoBoard; selection: readonly string[] }
type DemoWindow = typeof window & { boardChanges: DemoChange[]; boardEditErrors: unknown[]; hostBoard: DemoBoard }

function sectionState(element: Element) {
  const board = (element as BoardElement).board
  const section = board.sections.find((entry) => entry.id === 'section') as DemoSection
  const hebrew = board.items.find((item) => item.id === 'deck-hebrew') as DemoItem
  const small = board.items.find((item) => item.id === 'deck-small') as DemoItem
  return { section: structuredClone(section), hebrew: structuredClone(hebrew), small: structuredClone(small) }
}

async function checkRtlRightEdge(h: Harness, board: Locator, first: Locator, pageItem: Locator) {
  await board.evaluate((element) => {
    const value = element as BoardElement
    const next = structuredClone(value.board)
    const item = next.items.find((entry) => entry.id === 'deck-small')
    if (item) item.x = 100
    value.board = next
    const state = window as unknown as DemoWindow
    state.boardChanges = []
    state.hostBoard = next
  })
  const itemBox = await first.boundingBox()
  const from = await center(pageItem)
  if (!itemBox) throw new Error('The right-to-left grid item has no box.')
  await drag(h.page, from, itemBox.x + itemBox.width - 1 - from.x, itemBox.y + itemBox.height / 2 - from.y)
  await waitChanges(h.page, 1)
  const cells = await board.evaluate((element) => {
    const section = (element as BoardElement).board.sections.find((entry) => entry.id === 'section') as DemoSection & {
      cells: Array<{ id: string; row: number; column: number }>
    }
    return structuredClone(section.cells)
  })
  const page = cells.find((cell) => cell.id === 'page')
  const item = cells.find((cell) => cell.id === 'deck-small')
  h.check(
    'a physical right-edge drop inserts before the item in right-to-left reading order',
    page?.row === item?.row && page?.column === 0 && item?.column === 1,
    JSON.stringify(cells),
  )
}

export async function checkBoardEditingSections(
  h: Harness,
  board: Locator,
  first: Locator,
  second: Locator,
  reset: (direction?: 'ltr' | 'rtl') => Promise<void>,
) {
  const pageItem = board.locator('[data-board-item="page"]')
  const attached = await board.evaluate((element) => {
    const value = (element as BoardElement).board
    const section = value.sections.find((entry) => entry.id === 'section') as DemoSection & { cells?: unknown[] }
    return { changes: (window as unknown as DemoWindow).boardChanges.map((change) => change.edit.kind), section }
  })
  h.check(
    'attaching editing sends one settle change that stores cells and fits the section',
    attached.changes.filter((kind) => kind === 'settle').length === 1 && attached.section.cells?.length === 2 && attached.section.rectangle.height > 236,
    JSON.stringify(attached),
  )
  await reset()
  const titleBox = await board.locator('[part~="section-title"]').boundingBox()
  const labelBox = await board.locator('[part~="label"]').first().boundingBox()
  const initialOverlap =
    titleBox &&
    labelBox &&
    titleBox.x < labelBox.x + labelBox.width &&
    titleBox.x + titleBox.width > labelBox.x &&
    titleBox.y < labelBox.y + labelBox.height &&
    titleBox.y + titleBox.height > labelBox.y
  h.check('the initial Local assets label does not overlap the Two decks chip', !initialOverlap, JSON.stringify({ titleBox, labelBox }))

  const nudgeFrom = await center(second)
  await h.page.mouse.move(nudgeFrom.x, nudgeFrom.y)
  await h.page.mouse.down()
  await h.page.mouse.move(nudgeFrom.x + 10, nudgeFrom.y, { steps: 4 })
  const targetDuringDrag = await board.locator('[part~="section"]').evaluate((node) => ({
    attribute: node.hasAttribute('data-drop-target'),
    part: node.getAttribute('part'),
  }))
  const markerDuringDrag = await board.locator('[part~="drop-marker"]').count()
  await h.page.mouse.up()
  await waitChanges(h.page, 1)
  const nudged = await board.evaluate(sectionState)
  const targetAfterDrop = await board.locator('[part~="section"]').evaluate((node) => ({
    attribute: node.hasAttribute('data-drop-target'),
    part: node.getAttribute('part'),
  }))
  h.check('a member nudged inside its starting box stays a member', nudged.section.items.includes('deck-hebrew'), JSON.stringify(nudged))
  h.check(
    'the receiving section shows an insertion marker during drag and clears it on release',
    targetDuringDrag.attribute &&
      targetDuringDrag.part?.split(' ').includes('drop-target') === true &&
      markerDuringDrag === 1 &&
      !targetAfterDrop.attribute &&
      !targetAfterDrop.part?.includes('drop-target') &&
      (await board.locator('[part~="drop-marker"]').count()) === 0,
    JSON.stringify({ targetDuringDrag, markerDuringDrag, targetAfterDrop }),
  )

  await reset()
  const firstBox = await first.boundingBox()
  const pageFrom = await center(pageItem)
  if (!firstBox) throw new Error('The first grid item has no box.')
  await drag(h.page, pageFrom, firstBox.x + firstBox.width - 1 - pageFrom.x, firstBox.y + firstBox.height / 2 - pageFrom.y)
  await waitChanges(h.page, 1)
  const rightEdge = await board.evaluate((element) => {
    const section = (element as BoardElement).board.sections.find((entry) => entry.id === 'section') as DemoSection & {
      cells: Array<{ id: string; row: number; column: number }>
    }
    return structuredClone(section)
  })
  const pageCell = rightEdge.cells.find((cell) => cell.id === 'page')
  const firstCell = rightEdge.cells.find((cell) => cell.id === 'deck-small')
  h.check(
    'dropping a page on a member right edge inserts it after that member in the row',
    pageCell?.row === firstCell?.row && pageCell?.column === (firstCell?.column ?? -1) + 1,
    JSON.stringify(rightEdge),
  )

  await reset()
  const bottomBox = await first.boundingBox()
  const bottomFrom = await center(pageItem)
  if (!bottomBox) throw new Error('The first grid item has no box.')
  await drag(h.page, bottomFrom, bottomBox.x + bottomBox.width / 2 - bottomFrom.x, bottomBox.y + bottomBox.height - 1 - bottomFrom.y)
  await waitChanges(h.page, 1)
  const bottomEdge = await board.evaluate((element) => {
    const section = (element as BoardElement).board.sections.find((entry) => entry.id === 'section') as DemoSection & {
      cells: Array<{ id: string; row: number; column: number }>
    }
    return structuredClone(section)
  })
  const bottomPage = bottomEdge.cells.find((cell) => cell.id === 'page')
  const bottomFirst = bottomEdge.cells.find((cell) => cell.id === 'deck-small')
  h.check(
    'dropping on a member bottom edge starts the following row',
    bottomPage?.row === (bottomFirst?.row ?? -1) + 1 && bottomPage?.column === bottomFirst?.column,
    JSON.stringify(bottomEdge),
  )

  await reset()
  const original = await board.evaluate(sectionState)
  await drag(h.page, await center(second), 0, 500)
  await waitChanges(h.page, 1)
  const outside = await board.evaluate(sectionState)
  h.check(
    'dragging the Hebrew deck out removes it and shrinks Two decks around its remaining member',
    outside.section.items.join() === 'deck-small' &&
      outside.section.rectangle.width < original.section.rectangle.width &&
      outside.section.rectangle.height < original.section.rectangle.height,
    JSON.stringify({ original, outside }),
  )

  const lastMemberTopLeft = { x: outside.section.rectangle.x, y: outside.section.rectangle.y }
  await drag(h.page, await center(first), 0, 500)
  await waitChanges(h.page, 2)
  const emptiedOneAtATime = await board.evaluate(sectionState)
  h.check(
    'dragging the last member out leaves an empty minimum-size section at its previous top-left',
    emptiedOneAtATime.section.items.length === 0 &&
      emptiedOneAtATime.section.rectangle.x === lastMemberTopLeft.x &&
      emptiedOneAtATime.section.rectangle.y === lastMemberTopLeft.y &&
      emptiedOneAtATime.section.rectangle.width === 240 &&
      emptiedOneAtATime.section.rectangle.height === 160,
    JSON.stringify({ lastMemberTopLeft, emptiedOneAtATime }),
  )

  await reset()
  const togetherBefore = await board.evaluate(sectionState)
  await board.evaluate((element) => ((element as BoardElement).selection = ['deck-small', 'deck-hebrew']))
  await drag(h.page, await center(first), 0, 500)
  await waitChanges(h.page, 1)
  const emptiedTogether = await board.evaluate(sectionState)
  h.check(
    'dragging every member out together leaves an empty minimum-size section at its starting top-left',
    emptiedTogether.section.items.length === 0 &&
      emptiedTogether.section.rectangle.x === togetherBefore.section.rectangle.x &&
      emptiedTogether.section.rectangle.y === togetherBefore.section.rectangle.y &&
      emptiedTogether.section.rectangle.width === 240 &&
      emptiedTogether.section.rectangle.height === 160,
    JSON.stringify({ togetherBefore, emptiedTogether }),
  )

  await reset()
  await drag(h.page, await center(second), 0, 500)
  await waitChanges(h.page, 1)
  const outsideAgain = await board.evaluate(sectionState)
  const outsideValue = structuredClone(outsideAgain)
  const from = await center(second)
  const to = await center(first)
  await drag(h.page, from, to.x - from.x, to.y - from.y)
  await waitChanges(h.page, 2)
  const joined = await board.evaluate(sectionState)
  h.check(
    'dragging the Hebrew deck back into Two decks places it in the grid and grows the section',
    joined.section.items.includes('deck-small') &&
      joined.section.items.includes('deck-hebrew') &&
      joined.section.rectangle.height > outsideAgain.section.rectangle.height,
    JSON.stringify({ outside: outsideAgain, joined }),
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
    'widening a grid member changes only its column and leaves a clear page in place',
    !room.overlap && room.page.x === pageBefore.x && room.page.y === pageBefore.y && room.changes === 1,
    JSON.stringify({ pageBefore, room }),
  )

  await reset()
  await board.evaluate((element) => {
    const value = element as BoardElement
    const next = structuredClone(value.board)
    next.labels = next.labels.map((label) => (label.id === 'label' ? { ...label, x: 620, y: 80 } : label))
    value.board = next
    ;(window as unknown as DemoWindow).boardChanges = []
  })
  const labelBefore = await board.evaluate((element) => structuredClone((element as BoardElement).board.labels.find((label) => label.id === 'label')))
  await second.click()
  await drag(h.page, await center(board.locator('[part~="resize-handle"][data-corner="bottom-right"]')), 160, 0)
  await waitChanges(h.page, 1)
  const labelAfter = await board.evaluate((element) => structuredClone((element as BoardElement).board.labels.find((label) => label.id === 'label')))
  const grownSectionBox = await board.locator('[part~="section"]').boundingBox()
  const movedLabelBox = await board.locator('[part~="label"]').first().boundingBox()
  const labelOverlap =
    grownSectionBox &&
    movedLabelBox &&
    grownSectionBox.x < movedLabelBox.x + movedLabelBox.width &&
    grownSectionBox.x + grownSectionBox.width > movedLabelBox.x &&
    grownSectionBox.y < movedLabelBox.y + movedLabelBox.height &&
    grownSectionBox.y + grownSectionBox.height > movedLabelBox.y
  h.check(
    'a clear measured label stays in place when a grid column grows elsewhere',
    labelAfter?.x === labelBefore?.x && labelAfter?.y === labelBefore?.y && !labelOverlap,
    JSON.stringify({ labelBefore, labelAfter, grownSectionBox, movedLabelBox }),
  )

  await reset()
  await board.evaluate((element) => {
    const value = element as BoardElement
    const next = structuredClone(value.board)
    next.labels = [...next.labels, { id: 'empty-label', text: '', x: 2000, y: 2000 }]
    value.board = next
    const state = window as unknown as DemoWindow
    state.boardChanges = []
    state.boardEditErrors = []
    state.hostBoard = next
  })
  await first.click()
  await h.page.keyboard.press('ArrowRight')
  const emptyLabelEdit = await board.evaluate(() => {
    const state = window as unknown as DemoWindow
    return { changes: state.boardChanges.length, errors: state.boardEditErrors.length }
  })
  h.check(
    'keyboard nudges inside an auto section are ignored even with an unmeasured label',
    emptyLabelEdit.changes === 0 && emptyLabelEdit.errors === 0,
    JSON.stringify(emptyLabelEdit),
  )

  await reset('rtl')
  await checkRtlRightEdge(h, board, first, pageItem)

  await reset('rtl')
  const rtlBefore = await board.evaluate(sectionState)
  await drag(h.page, await center(second), 0, 500)
  await waitChanges(h.page, 1)
  const rtlAfter = await board.evaluate(sectionState)
  h.check(
    'right-to-left section membership follows the same physical drop coordinates',
    rtlAfter.hebrew.y - rtlBefore.hebrew.y === 500 &&
      rtlAfter.section.items.join() === 'deck-small' &&
      rtlAfter.section.rectangle.width < rtlBefore.section.rectangle.width,
    JSON.stringify({ rtlBefore, rtlAfter }),
  )
}
