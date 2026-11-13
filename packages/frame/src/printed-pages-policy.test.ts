import { expect, test } from 'bun:test'
import { currentPrintedPage, printedPageSpreads, printedPagesScale, printedPagesWindow, shouldReusePrintedPageSrcdoc } from './printed-pages-policy.ts'

const papers = Array.from({ length: 6 }, (_, index) => ({ page: index + 1, start: index * 100, end: index * 100 + 90 }))

test('windowing composes nearby papers while hysteresis keeps farther papers', () => {
  expect(printedPagesWindow(papers, 200, 100, 100, 300)).toEqual({ compose: [2, 3, 4, 5], keep: [1, 2, 3, 4, 5, 6] })
})

test('the keep window contains the compose window when its margin is smaller', () => {
  expect(printedPagesWindow(papers, 200, 100, 300, 0)).toEqual({ compose: [1, 2, 3, 4, 5, 6], keep: [1, 2, 3, 4, 5, 6] })
})

test('facing pairing puts an LTR recto at inline-end', () => {
  expect(printedPageSpreads(4)).toEqual([{ inlineEnd: 1 }, { inlineStart: 2, inlineEnd: 3 }, { inlineStart: 4, inlineEnd: undefined }])
})

test('fit and zoom scale paper geometry', () => {
  expect(printedPagesScale('width', { inline: 400, block: 600 }, { inline: 200, block: 150 }, 1.5)).toBe(0.75)
  expect(printedPagesScale('page', { inline: 400, block: 600 }, { inline: 200, block: 150 }, 2)).toBe(0.5)
  expect(printedPagesScale('none', { inline: 400, block: 600 }, { inline: 200, block: 150 }, 1.25)).toBe(1.25)
})

test('the reading line selects the paper that contains it', () => {
  expect(currentPrintedPage(papers, 205)).toBe(3)
  expect(currentPrintedPage(papers, 195)).toBe(3)
})

test('an identical srcdoc reuses the shown paper', () => {
  expect(shouldReusePrintedPageSrcdoc('same', 'same')).toBe(true)
  expect(shouldReusePrintedPageSrcdoc('old', 'new')).toBe(false)
})
