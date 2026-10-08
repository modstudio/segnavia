import { describe, expect, test } from 'bun:test'
import { selectFlows } from './index.ts'

const flows = [{ name: 'classes' }, { name: 'classes.create' }, { name: 'reports' }]

describe('flow selection', () => {
  test('a name selects itself and every flow under it, by dotted prefix only', () => {
    expect(selectFlows(flows, ['classes']).map((f) => f.name)).toEqual(['classes', 'classes.create'])
    expect(selectFlows([...flows, { name: 'classesextra' }], ['classes']).map((f) => f.name)).toEqual(['classes', 'classes.create'])
  })

  test('an unknown name is refused, listing the flows there are', () => {
    expect(() => selectFlows(flows, ['report'])).toThrow('No flow is named report. Flows: classes, classes.create, reports')
  })

  test('no selection runs every flow', () => {
    expect(selectFlows(flows, [])).toHaveLength(3)
  })
})
