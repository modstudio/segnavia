import { describe, expect, test } from 'bun:test'
import { RenderRefusedError } from './errors.ts'
import { parseProtection } from './protection-options.ts'

describe('PDF protection options', () => {
  test('copies the supported password and permission fields', () => {
    expect(
      parseProtection(
        {
          ownerPassword: 'owner',
          openPassword: 'open',
          permissions: { print: 'low', copy: true, modify: true, annotate: true, fillForms: true, assemble: true },
        },
        'bookPdf',
      ),
    ).toEqual({
      ownerPassword: 'owner',
      openPassword: 'open',
      permissions: { print: 'low', copy: true, modify: true, annotate: true, fillForms: true, assemble: true },
    })
  })

  test.each([
    [{ ownerPassword: '' }, 'protection.ownerPassword', 'non-empty'],
    [{ openPassword: '' }, 'protection.openPassword', 'non-empty'],
    [{ ownerPassword: '-SECRETDASH' }, 'protection.ownerPassword', "may not begin with '-'"],
    [{ openPassword: 'ab\0cd' }, 'protection.openPassword', 'remove U\\+0000'],
    [{ ownerPassword: 'ab\ud800cd' }, 'protection.ownerPassword', 'remove the unpaired surrogate'],
    [{ permissions: { print: 'medium' } }, 'protection.permissions.print', "'none', 'low', or 'high'"],
    [{ permissions: { copy: 'yes' } }, 'protection.permissions.copy', 'true or false'],
    [{ permissions: { accessibility: false } }, 'protection.permissions.accessibility', 'remove it'],
  ])('refuses invalid %s and names the field and remedy', (value, field, remedy) => {
    expect(() => parseProtection(value, 'bookPdf')).toThrow(RenderRefusedError)
    expect(() => parseProtection(value, 'bookPdf')).toThrow(new RegExp(`${field}.*${remedy}`))
  })

  test('does not echo a qpdf-option-shaped password in its refusal', () => {
    const secret = '-SECRETDASH'
    try {
      parseProtection({ ownerPassword: secret }, 'bookPdf')
      throw new Error('expected refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(RenderRefusedError)
      expect(String(error)).not.toContain(secret)
    }
  })

  test('refuses unknown nested options with the render call path', () => {
    expect(() => parseProtection({ extra: true }, 'bookPdf')).toThrow(RenderRefusedError)
    expect(() => parseProtection({ extra: true }, 'bookPdf')).toThrow(
      'bookPdf options.protection.extra: unknown option "extra"; remove it to clear this refusal',
    )
    expect(() => parseProtection({ permissions: { extra: true } }, 'bookPdf')).toThrow(
      'bookPdf options.protection.permissions.extra: unknown option "extra"; remove it to clear this refusal',
    )
  })
})
