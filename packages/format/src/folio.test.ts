import { describe, expect, test } from 'bun:test'
import { computeFolios, folioScript, type Numbering } from './folio.ts'

const arabic: Numbering = { system: 'arabic', start: 1, restart: false, counted: true }

describe('folio computation', () => {
  test('restarts a sequence at its configured start', () => {
    expect(computeFolios([{ numbering: arabic }, { numbering: arabic }, { numbering: { ...arabic, start: 8, restart: true } }, { numbering: arabic }])).toEqual(
      [
        { number: 1, text: '1' },
        { number: 2, text: '2' },
        { number: 8, text: '8' },
        { number: 9, text: '9' },
      ],
    )
  })

  test('uncounted pages have no folio and do not advance the sequence', () => {
    expect(computeFolios([{ numbering: arabic }, { numbering: { ...arabic, counted: false } }, { numbering: arabic }])).toEqual([
      { number: 1, text: '1' },
      null,
      { number: 2, text: '2' },
    ])
  })

  test('starts at a value other than one', () => {
    expect(computeFolios([{ numbering: { ...arabic, start: 4 } }, { numbering: arabic }])).toEqual([
      { number: 4, text: '4' },
      { number: 5, text: '5' },
    ])
  })

  test('front matter can use a different system from a restarted body', () => {
    expect(
      computeFolios([
        { numbering: { ...arabic, system: 'roman-lower' } },
        { numbering: { ...arabic, system: 'roman-lower' } },
        { numbering: { ...arabic, system: 'hebrew', restart: true } },
        { numbering: { ...arabic, system: 'hebrew' } },
      ]),
    ).toEqual([
      { number: 1, text: 'i' },
      { number: 2, text: 'ii' },
      { number: 1, text: 'א' },
      { number: 2, text: 'ב' },
    ])
  })

  test('uses the traditional letter order for Hebrew fifteen and sixteen', () => {
    expect(computeFolios([{ numbering: { ...arabic, system: 'hebrew', start: 15 } }, { numbering: { ...arabic, system: 'hebrew' } }])).toEqual([
      { number: 15, text: 'טו' },
      { number: 16, text: 'טז' },
    ])
  })

  test('embeds the same folio computation in a script', () => {
    const embedded = new Function(`${folioScript()};return computeFolios`)() as typeof computeFolios
    expect(embedded([{ numbering: { ...arabic, system: 'roman-upper', start: 4 } }])).toEqual([{ number: 4, text: 'IV' }])
  })
})
