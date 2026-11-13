import { expect, test } from 'bun:test'
import { resolvePageDayLoad } from './as-of-slots.ts'

test('page day loading resolves the document day before resolving its slots', async () => {
  const calls: string[] = []
  const controller = new AbortController()
  const resolved = await resolvePageDayLoad(
    { asOf: { kind: 'anchor', anchor: 'week' } },
    {
      moment: Date.parse('2026-11-13T12:00:00Z'),
      anchors: {
        choices: [{ name: 'week', label: 'Week' }],
        resolve: async () => {
          calls.push('day')
          return '2026-11-09'
        },
      },
    },
    {
      resolve: async ({ day }) => {
        calls.push(`slots:${day.date}`)
        return { id: 'week', values: { name: 'Avi' } }
      },
    },
    controller.signal,
  )

  expect(calls).toEqual(['day', 'slots:2026-11-09'])
  expect(resolved.day).toMatchObject({ date: '2026-11-09', kind: 'anchor', anchor: 'week' })
  expect(resolved.slots.source).toEqual({ id: 'week', values: { name: 'Avi' } })
})
