import { describe, expect, test } from 'bun:test'
import { AsOfRefusedError } from './as-of-policy.ts'
import { type AnchorSource, resolveDocumentDay } from './document-day.ts'

const moment = Date.parse('2026-11-14T04:30:00Z')
const signal = new AbortController().signal
const source = (resolve: AnchorSource['resolve'], choices = ['shabbos']): AnchorSource => ({
  choices: choices.map((name) => ({ name, label: name })),
  resolve,
})

describe('resolveDocumentDay', () => {
  test('returns fixed and current days without an anchor source', async () => {
    await expect(resolveDocumentDay({ kind: 'fixed', date: '2026-11-10' }, { moment, signal })).resolves.toEqual({
      date: '2026-11-10',
      zone: 'UTC',
      kind: 'fixed',
    })
    await expect(resolveDocumentDay(undefined, { moment, hostZone: 'America/New_York', signal })).resolves.toEqual({
      date: '2026-11-13',
      zone: 'America/New_York',
      kind: 'current',
    })
  })

  test('awaits an anchor resolver and carries the anchor name', async () => {
    const calls: unknown[] = []
    const anchors = source(async (name, context) => {
      calls.push({ name, ...context })
      return Promise.resolve('2026-11-14')
    })
    await expect(resolveDocumentDay({ kind: 'anchor', anchor: 'shabbos' }, { moment, anchors, signal })).resolves.toEqual({
      date: '2026-11-14',
      zone: 'UTC',
      kind: 'anchor',
      anchor: 'shabbos',
    })
    expect(calls).toMatchObject([{ name: 'shabbos', moment, today: '2026-11-14', zone: 'UTC', signal }])
  })

  test.each([
    ['missing source', undefined, 'register an anchor source that offers it'],
    ['unoffered name', source(async () => '2026-11-14', ['weekday']), 'choose one of "weekday"'],
    ['null result', source(async () => null), "host's anchor source returned no date"],
    ['invalid result', source(async () => '2026-02-30'), 'returned an invalid date'],
  ])('refuses a %s with the anchor and requested day', async (_case, anchors, remedy) => {
    const result = resolveDocumentDay({ kind: 'anchor', anchor: 'shabbos' }, { moment, anchors, signal })
    await expect(result).rejects.toBeInstanceOf(AsOfRefusedError)
    await expect(result).rejects.toThrow('shabbos')
    await expect(result).rejects.toThrow('2026-11-14')
    await expect(result).rejects.toThrow(remedy)
  })

  test('honors an already-aborted signal without calling the source', async () => {
    const controller = new AbortController()
    controller.abort()
    let calls = 0
    await expect(
      resolveDocumentDay(
        { kind: 'anchor', anchor: 'shabbos' },
        {
          moment,
          anchors: source(async () => {
            calls += 1
            return '2026-11-14'
          }),
          signal: controller.signal,
        },
      ),
    ).rejects.toHaveProperty('name', 'AbortError')
    expect(calls).toBe(0)
  })
})
