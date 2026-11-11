import { expect, test } from 'bun:test'
import type { AsOfDay, SlotsOptions } from '@segnavia/format'
import { slotsForDay, slotsWithDay } from './day-slots.ts'
import { hasSlotWork, prepareSlots } from './slots.ts'

const day: AsOfDay = { date: '2026-11-14', zone: 'America/New_York', kind: 'anchor', anchor: 'shabbos' }

test('resolves slots once with the established day and binds the reserved context', async () => {
  const calls: unknown[] = []
  const signal = new AbortController().signal
  const options: SlotsOptions = {
    resolve: async (context) => {
      calls.push(context)
      return { id: 'day', values: { title: 'Bulletin' } }
    },
  }
  const resolved = await slotsForDay(options, day, signal, true)
  expect(resolved.declarations).toContainEqual({ key: 'asOf.moment', label: 'As-of moment', type: 'text' })
  const prepared = await prepareSlots([{ key: 'title', label: 'Title', type: 'text', required: false }], resolved, signal)
  expect(calls).toEqual([{ day, signal }])
  expect(prepared.apply('<h1 data-slot-value="title"></h1><time data-slot-value="asOf.date"></time><b data-slot-value="asOf.anchor"></b>')).toBe(
    '<h1 dir="auto">Bulletin</h1><time dir="auto">2026-11-14</time><b dir="auto">shabbos</b>',
  )
})

test('refuses source with resolve and host claims on the reserved root', () => {
  expect(() => slotsWithDay({ source: { id: 'held', values: {} }, resolve: async () => undefined }, day, undefined)).toThrow('slots.source and slots.resolve')
  expect(() => slotsWithDay({ declarations: [{ key: 'asOf.date', label: 'Host date', type: 'text' }] }, day, undefined)).toThrow('reserved asOf context')
})

test('refuses copy fills with resolve before resolving the source', async () => {
  let calls = 0
  const options = {
    fills: [{ fill: { id: 'copy', values: {} } }],
    resolve: async () => {
      calls++
      return undefined
    },
  }
  await expect(slotsForDay(options, day, new AbortController().signal)).rejects.toThrow('slots.fills and slots.resolve')
  expect(calls).toBe(0)
})

test('a page without an as-of binding keeps the host slot-work path unchanged', () => {
  const resolved = slotsWithDay(undefined, day, undefined)
  expect(resolved).not.toHaveProperty('declarations')
  expect(resolved).not.toHaveProperty('overrides')
  expect(hasSlotWork(undefined, resolved)).toBe(false)
})
