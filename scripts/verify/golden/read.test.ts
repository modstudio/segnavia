import { describe, expect, test } from 'bun:test'
import { parsePdfFonts } from './read.ts'

const PDF_FONTS = `name                                 type              encoding         emb sub uni object ID
------------------------------------ ----------------- ---------------- --- --- --- ---------
ABCDEF+Three                         Type 3            Custom           yes no  no       1  0
GHIJKL+Cid                           CID TrueType      Identity-H       yes yes yes      2  0
MNOPQR+Plain                         TrueType          WinAnsi          yes yes yes      3  0
STUVWX+External                      Type 1C           Custom           no  no  no       4  0
`

describe('pdffonts reader', () => {
  test('reads embedded names by the table extents when font types contain spaces', () => {
    expect(parsePdfFonts(PDF_FONTS)).toEqual(['Cid', 'Plain', 'Three'])
  })
})
