import { describe, expect, test } from 'bun:test'
import { computeFolios, folioScript, type Numbering, sequenceFolios } from './folio.ts'

const arabic: Numbering = { system: 'arabic', start: 1, restart: false, counted: true, printed: true }

describe('folio computation', () => {
  test('restarts a sequence at its configured start', () => {
    expect(computeFolios([{ numbering: arabic }, { numbering: arabic }, { numbering: { ...arabic, start: 8, restart: true } }, { numbering: arabic }])).toEqual(
      [
        { number: 1, text: '1', printed: true },
        { number: 2, text: '2', printed: true },
        { number: 8, text: '8', printed: true },
        { number: 9, text: '9', printed: true },
      ],
    )
  })

  test('uncounted pages have no folio and do not advance the sequence', () => {
    expect(computeFolios([{ numbering: arabic }, { numbering: { ...arabic, counted: false } }, { numbering: arabic }])).toEqual([
      { number: 1, text: '1', printed: true },
      null,
      { number: 2, text: '2', printed: true },
    ])
  })

  test('counts an unprinted folio without dropping its number or text', () => {
    expect(computeFolios([{ numbering: { ...arabic, printed: false } }, { numbering: arabic }])).toEqual([
      { number: 1, text: '1', printed: false },
      { number: 2, text: '2', printed: true },
    ])
  })

  test('starts at a value other than one', () => {
    expect(computeFolios([{ numbering: { ...arabic, start: 4 } }, { numbering: arabic }])).toEqual([
      { number: 4, text: '4', printed: true },
      { number: 5, text: '5', printed: true },
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
      { number: 1, text: 'i', printed: true },
      { number: 2, text: 'ii', printed: true },
      { number: 1, text: 'א', printed: true },
      { number: 2, text: 'ב', printed: true },
    ])
  })

  test('uses the traditional letter order for Hebrew fifteen and sixteen', () => {
    expect(computeFolios([{ numbering: { ...arabic, system: 'hebrew', start: 15 } }, { numbering: { ...arabic, system: 'hebrew' } }])).toEqual([
      { number: 15, text: 'טו', printed: true },
      { number: 16, text: 'טז', printed: true },
    ])
  })

  test('builds a counted sequence in one number system', () => {
    expect(sequenceFolios(3, 'roman-upper')).toEqual([
      { number: 1, text: 'I', printed: true },
      { number: 2, text: 'II', printed: true },
      { number: 3, text: 'III', printed: true },
    ])
  })

  test('embeds the same folio computation in a script', () => {
    const embedded = new Function(`${folioScript()};return {computeFolios,sequenceFolios}`)() as {
      computeFolios: typeof computeFolios
      sequenceFolios: typeof sequenceFolios
    }
    expect(embedded.computeFolios([{ numbering: { ...arabic, system: 'roman-upper', start: 4 } }])).toEqual([{ number: 4, text: 'IV', printed: true }])
    expect(embedded.sequenceFolios(2, 'roman-lower')).toEqual([
      { number: 1, text: 'i', printed: true },
      { number: 2, text: 'ii', printed: true },
    ])
  })

  test('keeps embedded formatter and folio names after minification', async () => {
    const built = await Bun.build({
      entrypoints: ['virtual:folio-script'],
      minify: true,
      target: 'browser',
      conditions: ['@segnavia/source'],
      format: 'cjs',
      plugins: [
        {
          name: 'folio-script',
          setup(builder) {
            builder.onResolve({ filter: /^virtual:folio-script$/ }, () => ({ path: 'folio-script', namespace: 'virtual' }))
            builder.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
              contents: `import { folioScript } from ${JSON.stringify(`${import.meta.dir}/folio.ts`)}; export const script = folioScript();`,
              loader: 'ts',
            }))
          },
        },
      ],
    })
    expect(built.success).toBe(true)
    const bundle = await built.outputs[0]?.text()
    expect(bundle).toBeDefined()
    const script = new Function('module', 'exports', `${bundle};return module.exports.script`)({ exports: {} }, {}) as string
    const embedded = new Function(`${script};return {computeFolios,sequenceFolios}`)() as {
      computeFolios: typeof computeFolios
      sequenceFolios: typeof sequenceFolios
    }
    expect(embedded.computeFolios([{ numbering: { ...arabic, system: 'hebrew', start: 15 } }])).toEqual([{ number: 15, text: 'טו', printed: true }])
    expect(embedded.sequenceFolios(2, 'roman-lower')).toEqual([
      { number: 1, text: 'i', printed: true },
      { number: 2, text: 'ii', printed: true },
    ])
  })
})
