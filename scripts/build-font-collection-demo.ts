import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fontFaceCss } from '@segnavia/html'
import type { Renderer } from '@segnavia/render'

interface SfntTable {
  record: Uint8Array
  data: Uint8Array
}

function tables(bytes: Uint8Array): SfntTable[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: view.getUint16(4) }, (_, index) => {
    const recordOffset = 12 + index * 16
    const offset = view.getUint32(recordOffset + 8)
    const length = view.getUint32(recordOffset + 12)
    return { record: bytes.slice(recordOffset, recordOffset + 16), data: bytes.slice(offset, offset + length) }
  })
}

function collection(faces: Uint8Array[]): Uint8Array {
  const faceTables = faces.map(tables)
  const headerSize = 12 + faces.length * 4
  const directories = faceTables.map((items) => 12 + items.length * 16)
  let size = headerSize + directories.reduce((sum, length) => sum + length, 0)
  for (const items of faceTables) for (const table of items) size += (table.data.length + 3) & ~3
  const output = new Uint8Array(size)
  const view = new DataView(output.buffer)
  output.set(new TextEncoder().encode('ttcf'))
  view.setUint32(4, 0x00010000)
  view.setUint32(8, faces.length)
  let directoryOffset = headerSize
  let tableOffset = headerSize + directories.reduce((sum, length) => sum + length, 0)
  faceTables.forEach((items, faceIndex) => {
    view.setUint32(12 + faceIndex * 4, directoryOffset)
    output.set(faces[faceIndex]?.subarray(0, 12) ?? [], directoryOffset)
    items.forEach((table, tableIndex) => {
      const recordOffset = directoryOffset + 12 + tableIndex * 16
      output.set(table.record, recordOffset)
      view.setUint32(recordOffset + 8, tableOffset)
      output.set(table.data, tableOffset)
      tableOffset += (table.data.length + 3) & ~3
    })
    directoryOffset += directories[faceIndex] ?? 0
  })
  return output
}

export async function buildFontCollectionDemo(root: string, site: string, output: string, renderer: Renderer): Promise<void> {
  const alef = new Uint8Array(readFileSync(path.join(root, 'fixtures/hebrew-notice/Alef-Regular.ttf')))
  const noto = new Uint8Array(readFileSync(path.join(root, 'fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')))
  const packed = collection([alef, noto])
  const collectionCss = fontFaceCss({ family: 'Collection Alef', data: packed, format: 'collection', postscriptName: 'Alef-Regular' })
  const standaloneCss = fontFaceCss({ family: 'Standalone Alef', data: alef, format: 'truetype' })
  writeFileSync(
    path.join(site, 'font-collection.html'),
    `<!doctype html><meta charset="utf-8"><style>${collectionCss}${standaloneCss}body{margin:0}.probe{display:block;width:max-content;font-size:72px;line-height:1;font-weight:400;color:#000;background:#fff}.collection{font-family:"Collection Alef"}.standalone{font-family:"Standalone Alef"}</style><span class="probe collection">אבגדהוז</span><span class="probe standalone">אבגדהוז</span>`,
  )
  const page = { html: '<p style="margin:0;font-family:CollectionDemo;font-size:72px">אבגדהוז</p>' }
  writeFileSync(
    path.join(output, 'font-collection.pdf'),
    await renderer.pagePdf(page, {
      fonts: [{ family: 'CollectionDemo', data: packed, format: 'collection', postscriptName: 'Alef-Regular' }],
    }),
  )
  writeFileSync(
    path.join(output, 'font-standalone.pdf'),
    await renderer.pagePdf(page, { fonts: [{ family: 'CollectionDemo', data: alef, format: 'truetype' }] }),
  )
}
