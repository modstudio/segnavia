import { expect, test } from 'bun:test'
import { composerScript } from './composer.ts'

test('fill and measured properties run once after copyfit and before the first pagination measurement', () => {
  const script = composerScript('{}')
  const fit = script.indexOf('fitResults=fitSourceElements()')
  const fill = script.indexOf('fillSourceRegions()', fit)
  const properties = script.indexOf('propertyResults=measureSourceProperties()', fill)
  const input = script.indexOf('var input=measureInput()', properties)
  expect(fit).toBeGreaterThan(-1)
  expect(fill).toBeGreaterThan(fit)
  expect(properties).toBeGreaterThan(fill)
  expect(input).toBeGreaterThan(properties)
  expect(script.match(/fillSourceRegions\(\)/g)).toHaveLength(1)
  expect(script.match(/propertyResults=measureSourceProperties\(\)/g)).toHaveLength(1)
  expect(script).toContain('properties:propertyResults')
})
