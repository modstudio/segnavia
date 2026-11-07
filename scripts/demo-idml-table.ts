import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { importIdml } from '@segnavia/idml'

const mimetype = 'application/vnd.adobe.indesign-idml-package'

function join(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((total, part) => total + part.byteLength, 0)
  const output = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

function record(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size)
  return { bytes, view: new DataView(bytes.buffer) }
}

function storedZip(entries: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const content = encoder.encode(entry.content)
    const local = record(30 + name.length + content.length)
    local.view.setUint32(0, 0x0403_4b50, true)
    local.view.setUint16(4, 20, true)
    local.view.setUint32(18, content.length, true)
    local.view.setUint32(22, content.length, true)
    local.view.setUint16(26, name.length, true)
    local.bytes.set(name, 30)
    local.bytes.set(content, 30 + name.length)
    locals.push(local.bytes)
    const directory = record(46 + name.length)
    directory.view.setUint32(0, 0x0201_4b50, true)
    directory.view.setUint16(4, 20, true)
    directory.view.setUint16(6, 20, true)
    directory.view.setUint32(20, content.length, true)
    directory.view.setUint32(24, content.length, true)
    directory.view.setUint16(28, name.length, true)
    directory.view.setUint32(42, offset, true)
    directory.bytes.set(name, 46)
    central.push(directory.bytes)
    offset += local.bytes.length
  }
  const directory = join(central)
  const end = record(22)
  end.view.setUint32(0, 0x0605_4b50, true)
  end.view.setUint16(8, entries.length, true)
  end.view.setUint16(10, entries.length, true)
  end.view.setUint32(12, directory.length, true)
  end.view.setUint32(16, offset, true)
  return join([...locals, directory, end.bytes])
}

function paragraph(text: string): string {
  return `<ParagraphStyleRange AppliedParagraphStyle="body"><CharacterStyleRange><Content>${text}</Content></CharacterStyleRange></ParagraphStyleRange>`
}

function longTable(): string {
  const cells = [`<Cell Name="0:0">${paragraph('Heading')}</Cell>`, `<Cell Name="1:0">${paragraph('Value')}</Cell>`]
  for (let row = 1; row <= 48; row += 1) {
    if (row === 1) cells.push(`<Cell Name="0:${row}" ColumnSpan="2">${paragraph('Spanning row')}</Cell>`)
    else cells.push(`<Cell Name="0:${row}">${paragraph(`Row ${row}`)}</Cell>`, `<Cell Name="1:${row}">${paragraph(String(row))}</Cell>`)
  }
  const rows = Array.from({ length: 49 }, () => '<Row SingleRowHeight="18" AutoGrow="false"/>').join('')
  return `<Table AppliedTableStyle="long" HeaderRowCount="1" BodyRowCount="48"><Column SingleColumnWidth="100"/><Column SingleColumnWidth="70"/>${cells.join('')}${rows}</Table>`
}

function rtlTable(): string {
  return `<Table AppliedTableStyle="rtl" BodyRowCount="1" TableDirection="RightToLeft"><Column SingleColumnWidth="80"/><Column SingleColumnWidth="80"/><Cell Name="0:0">${paragraph('RTL first')}</Cell><Cell Name="1:0">${paragraph('RTL second')}</Cell><Row/></Table>`
}

export async function buildIdmlTableDemo(site: string): Promise<void> {
  const designmap =
    '<Document Self="IDML tables"><DocumentPreference PageWidth="300" PageHeight="400" FacingPages="false"/><MarginPreference Top="24" Bottom="24" Left="24" Right="24"/><idPkg:Spread src="Spreads/Spread.xml"/><idPkg:Styles src="Resources/Styles.xml"/></Document>'
  const styles =
    '<idPkg:Styles><RootParagraphStyleGroup><ParagraphStyle Self="body" Name="Body" PointSize="10" Leading="12"/></RootParagraphStyleGroup><RootTableStyleGroup><TableStyle Self="long" Name="Long table"/><TableStyle Self="rtl" Name="RTL"/></RootTableStyleGroup></idPkg:Styles>'
  const story = `<Story Self="table-story"><ParagraphStyleRange AppliedParagraphStyle="body"><CharacterStyleRange><Content></Content>${longTable()}${rtlTable()}</CharacterStyleRange></ParagraphStyleRange></Story>`
  const spread =
    '<Spread Self="spread"><Page Self="page" GeometricBounds="0 0 400 300"/><TextFrame ParentStory="table-story"><PathGeometry><PathPointType Anchor="24 24"/><PathPointType Anchor="376 276"/></PathGeometry></TextFrame></Spread>'
  const bytes = storedZip([
    { name: 'mimetype', content: mimetype },
    { name: 'designmap.xml', content: designmap },
    { name: 'Spreads/Spread.xml', content: spread },
    { name: 'Resources/Styles.xml', content: styles },
    { name: 'Stories/Story.xml', content: story },
  ])
  const { book } = await importIdml(bytes)
  writeFileSync(path.join(site, 'book-idml-table.html'), bookValueDocument(book, { nonce: newNonce(), css: ':where(table){font:12px/1.2 sans-serif}' }))
}
