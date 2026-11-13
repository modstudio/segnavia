import { describe, expect, test } from 'bun:test'
import { type PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { parsePdfFonts, pdfStructureHeadingLevels } from './read.ts'

const PDF_FONTS = `name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
ABCDEF+Three                         Type 3            Custom           yes no  no       1  0
GHIJKL+Cid                           CID TrueType      Identity-H       yes yes yes      2  0
MNOPQR+Plain                         TrueType          WinAnsi          yes yes yes      3  0
STUVWX+External                      Type 1C           Custom           no  no  no       4  0
AAAAAA+.SFNS-Regular_wdth_opsz400000_GRAD_wght2BC0000 Type 3            Custom           yes yes yes     74  0
`

describe('pdffonts reader', () => {
  test('reads embedded names from the right when types and names exceed their columns', () => {
    expect(parsePdfFonts(PDF_FONTS)).toEqual(['.SFNS-Regular_wdth_opsz400000_GRAD_wght2BC0000', 'Cid', 'Plain', 'Three'])
  })

  test('refuses a data row whose trailing fields are not recognizable', () => {
    expect(() => parsePdfFonts(`${PDF_FONTS}BROKEN+Font Type 3 Custom maybe yes yes 5 0\n`)).toThrow(
      'pdffonts row has an unrecognized ending: BROKEN+Font Type 3 Custom maybe yes yes 5 0',
    )
  })
})

test('reads heading levels from the tagged structure tree in document order', async () => {
  const document = await PDFDocument.create()
  const root = document.context.obj({ Type: 'StructTreeRoot', K: [] })
  const rootReference = document.context.register(root)
  const h1 = document.context.register(document.context.obj({ Type: 'StructElem', S: 'H1', P: rootReference, K: [] }))
  const section = document.context.register(document.context.obj({ Type: 'StructElem', S: 'Sect', P: rootReference, K: [] }))
  const h2 = document.context.register(document.context.obj({ Type: 'StructElem', S: 'H2', P: section, K: [] }))
  ;(document.context.lookup(section) as PDFDict).set(PDFName.of('K'), document.context.obj([h2]))
  root.set(PDFName.of('K'), document.context.obj([h1, section]))
  document.catalog.set(PDFName.of('StructTreeRoot'), rootReference)
  expect(pdfStructureHeadingLevels(document)).toEqual([1, 2])
})
