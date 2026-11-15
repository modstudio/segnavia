import { expect, test } from 'bun:test'
import { receivedPageFacts } from './received-page.ts'

const mediaBox = { x: 10, y: 20, width: 200, height: 300 }
const trimBox = { x: 30, y: 50, width: 120, height: 180 }

test.each([
  [0, { width: 200, height: 300 }, { x: 20, y: 30, width: 120, height: 180 }, [1, 0, 0, 1, 10, 20]],
  [90, { width: 300, height: 200 }, { x: 30, y: 60, width: 180, height: 120 }, [0, 1, -1, 0, 210, 20]],
  [180, { width: 200, height: 300 }, { x: 60, y: 90, width: 120, height: 180 }, [-1, 0, 0, -1, 210, 320]],
  [270, { width: 300, height: 200 }, { x: 90, y: 20, width: 180, height: 120 }, [0, -1, 1, 0, 10, 320]],
] as const)('maps an offset page at %s degrees into its viewed frame', (rotate, media, frame, matrix) => {
  expect(receivedPageFacts({ mediaBox, trimBox, rotate, page: 1 })).toEqual({ frame: trimBox, viewed: { media, frame }, matrix })
})

test('uses trim, then crop, then media and clips the selected frame to media', () => {
  const cropBox = { x: 20, y: 30, width: 150, height: 250 }
  expect(receivedPageFacts({ mediaBox, cropBox, rotate: 0, page: 1 }).frame).toEqual(cropBox)
  expect(receivedPageFacts({ mediaBox, rotate: 0, page: 1 }).frame).toEqual(mediaBox)
  expect(receivedPageFacts({ mediaBox, cropBox, trimBox: { x: 0, y: 0, width: 400, height: 400 }, rotate: 0, page: 1 }).frame).toEqual(mediaBox)
})

test('refuses a zero-area clipped frame and names the page', () => {
  expect(() => receivedPageFacts({ mediaBox, trimBox: { x: 500, y: 0, width: 10, height: 10 }, rotate: 0, page: 3 })).toThrow(
    'Received PDF page 3 has a zero-area',
  )
})
