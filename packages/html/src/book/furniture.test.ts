import { describe, expect, test } from 'bun:test'
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

  test('the embedded script matches the imported function', () => {
    const run = new Function(`${furnitureScript()}; return fillBookFurniture;`)() as typeof fillBookFurniture
    const html = '<div data-motif="segnavia:folio"></div>'
    expect(run(html, { folio: 'א' }, undefined, 'he')).toEqual(fillBookFurniture(html, { folio: 'א' }, undefined, 'he'))
  })
})
