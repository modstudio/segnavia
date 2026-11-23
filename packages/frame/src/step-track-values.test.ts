import { expect, test } from 'bun:test'
import { stepTrackSliderValues } from './step-track-values.ts'

test('step track slider values describe the current titled slide', () => {
  const values = stepTrackSliderValues(2, 6, 'Sources', (number, total, title) => `${title}: ${number} of ${total}`)
  expect(values).toEqual({
    'aria-valuemin': '1',
    'aria-valuemax': '6',
    'aria-valuenow': '3',
    'aria-valuetext': 'Sources: 3 of 6',
  })
})
