import { describe, expect, test } from 'bun:test'
import { chooseMotifVersion, Motif, MotifInput } from './motif.ts'

const input = {
  key: 'letterhead',
  revision: 'r1',
  label: 'Letterhead',
  fields: [{ key: 'form', label: 'Form', choices: ['full', 'compact'], default: 'full' }],
  versions: [
    { lang: 'he', html: 'he' },
    { lang: 'en', html: 'en' },
    { lang: 'en', when: { form: 'compact' }, html: 'compact' },
  ],
}

describe('Motif', () => {
  test('reads stored motifs tolerantly and accepts strict input', () => {
    expect(Motif.parse({ ...input, future: true }).fonts).toEqual([])
    expect(MotifInput.parse(input).key).toBe('letterhead')
    expect(() => MotifInput.parse({ ...input, future: true })).toThrow()
  })

  test.each([
    [
      'duplicate version',
      {
        ...input,
        versions: [
          { lang: 'en', html: 'a' },
          { lang: 'EN', html: 'b' },
        ],
      },
    ],
    ['when on value-only field', { ...input, fields: [{ key: 'name', label: 'Name' }], versions: [{ lang: 'en', when: { name: 'legal' }, html: '' }] }],
    ['when outside choices', { ...input, versions: [{ lang: 'en', when: { form: 'tiny' }, html: '' }] }],
    ['default outside choices', { ...input, fields: [{ key: 'form', label: 'Form', choices: ['full'], default: 'tiny' }] }],
    ['declared lang', { ...input, fields: [{ key: 'lang', label: 'Language' }] }],
  ])('refuses %s', (_name, value) => expect(Motif.safeParse(value).success).toBe(false))
})

describe('chooseMotifVersion', () => {
  const motif = Motif.parse(input)

  test('chooses the most specific matching version', () => {
    expect(chooseMotifVersion(motif, { lang: 'en', form: 'full' })).toMatchObject({ ok: true, index: 1 })
    expect(chooseMotifVersion(motif, { lang: 'en', form: 'compact' })).toMatchObject({ ok: true, index: 2 })
  })

  test('uses primary subtags but prefers exact languages', () => {
    expect(chooseMotifVersion(motif, { lang: 'he-IL' })).toMatchObject({ ok: true, index: 0 })
    const exact = Motif.parse({
      ...input,
      versions: [
        { lang: 'he', html: 'base' },
        { lang: 'he-IL', html: 'exact' },
      ],
    })
    expect(chooseMotifVersion(exact, { lang: 'he-IL' })).toMatchObject({ ok: true, index: 1 })
  })

  test('refuses ambiguous matches and absent language', () => {
    const ambiguous = Motif.parse({
      ...input,
      fields: [
        { key: 'form', label: 'Form', choices: ['compact'] },
        { key: 'tone', label: 'Tone', choices: ['formal'] },
      ],
      versions: [
        { lang: 'en', when: { form: 'compact' }, html: 'a' },
        { lang: 'en', when: { tone: 'formal' }, html: 'b' },
      ],
    })
    expect(chooseMotifVersion(ambiguous, { lang: 'en', form: 'compact', tone: 'formal' })).toMatchObject({ ok: false })
    expect(chooseMotifVersion(motif, {})).toMatchObject({ ok: false })
  })

  test('uses the only language when none is supplied', () => {
    const single = Motif.parse({ ...input, versions: [{ lang: 'en', html: 'only' }] })
    expect(chooseMotifVersion(single, {})).toMatchObject({ ok: true, index: 0 })
  })
})
