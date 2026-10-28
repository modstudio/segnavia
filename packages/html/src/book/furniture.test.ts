import { describe, expect, test } from 'bun:test'
import { resolveDirection } from '@segnavia/format'
import { fillBookFurniture, furnitureScript } from './furniture.ts'

describe('fillBookFurniture', () => {
  test('fills catalogued motifs and isolates each value', () => {
    const html = '<div class="segnavia-running-head" data-motif="segnavia:running-head"></div><div class="segnavia-folio" data-motif="segnavia:folio"></div>'
    expect(fillBookFurniture(html, { folio: '7', runningHead: 'Heading' }, 'ltr', 'en')).toBe(
      '<div class="segnavia-running-head"><bdi dir="ltr">Heading</bdi></div><div class="segnavia-folio"><bdi dir="ltr">7</bdi></div>',
    )
  })

  test('omits a motif whose value is absent and resolves Hebrew from the value', () => {
    const html = '<div class="segnavia-running-head" DATA-MOTIF=segnavia:running-head></div><div class="segnavia-folio" data-motif="segnavia:folio"></div>'
    expect(fillBookFurniture(html, { runningHead: 'ראשון' })).toBe('<div class="segnavia-running-head"><bdi dir="rtl">ראשון</bdi></div>')
  })

  test('fills first and last values for two named marks from each page plan', () => {
    const html =
      '<span class="kavana" data-motif="segnavia:mark" data-motif-name="kavana"></span><span class="siman" data-motif="segnavia:mark" data-motif-name="siman" data-motif-which="last"></span>'
    const pages = [
      { marks: { kavana: { first: 'Intention A', last: 'Intention B' }, siman: { first: 'Sign A', last: 'Sign B' } } },
      { marks: { kavana: { first: 'Intention B', last: 'Intention B' }, siman: { first: 'Sign B', last: 'Sign B' } } },
      {},
    ]
    expect(pages.map((page) => fillBookFurniture(html, page, undefined, 'en'))).toEqual([
      '<span class="kavana"><bdi dir="ltr">Intention A</bdi></span><span class="siman"><bdi dir="ltr">Sign B</bdi></span>',
      '<span class="kavana"><bdi dir="ltr">Intention B</bdi></span><span class="siman"><bdi dir="ltr">Sign B</bdi></span>',
      '',
    ])
  })

  test('the embedded script matches the imported function', () => {
    const run = new Function(`${furnitureScript()}; return fillBookFurniture;`)() as typeof fillBookFurniture
    const html = '<div data-motif="segnavia:mark" data-motif-name="siman"></div>'
    const values = { marks: { siman: { first: 'א', last: 'ב' } } }
    expect(run(html, values, undefined, 'he')).toEqual(fillBookFurniture(html, values, undefined, 'he'))
  })

  test('the embedded resolver matches the format export', () => {
    const run = new Function(`${furnitureScript()}; return resolveDirection;`)() as typeof resolveDirection
    expect(run('ltr', 'he', 'שלום')).toBe(resolveDirection('ltr', 'he', 'שלום'))
    expect(run('auto', 'he-IL', 'Hello')).toBe(resolveDirection('auto', 'he-IL', 'Hello'))
    expect(run(undefined, undefined, 'שלום')).toBe(resolveDirection(undefined, undefined, 'שלום'))
    expect(run(undefined, undefined, '42')).toBe(resolveDirection(undefined, undefined, '42'))
  })
})
