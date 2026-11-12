import { describe, expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { parseProtection } from './protection-options.ts'

describe('PDF protection options', () => {
  test('copies the supported password and permission fields', () => {
    expect(
      parseProtection({
        ownerPassword: 'owner',
        openPassword: 'open',
        permissions: { print: 'low', copy: true, modify: true, annotate: true, fillForms: true, assemble: true },
      }),
    ).toEqual({
      ownerPassword: 'owner',
      openPassword: 'open',
      permissions: { print: 'low', copy: true, modify: true, annotate: true, fillForms: true, assemble: true },
    })
  })

  test.each([
    [{ ownerPassword: '' }, 'protection.ownerPassword', 'non-empty'],
    [{ openPassword: '' }, 'protection.openPassword', 'non-empty'],
    [{ permissions: { print: 'medium' } }, 'protection.permissions.print', "'none', 'low', or 'high'"],
    [{ permissions: { copy: 'yes' } }, 'protection.permissions.copy', 'true or false'],
    [{ permissions: { accessibility: false } }, 'protection.permissions.accessibility', 'remove it'],
  ])('refuses invalid %s and names the field and remedy', (value, field, remedy) => {
    expect(() => parseProtection(value)).toThrow(RenderRefusedError)
    expect(() => parseProtection(value)).toThrow(new RegExp(`${field}.*${remedy}`))
  })
})
