import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { firstGoldenDifference, goldenFailure } from './compare.ts'
import { GOLDEN_FIXTURES, type GoldenPdf, goldenFixturePath } from './model.ts'
import { pdfStructureHeadingLevels, readGoldenPdf } from './read.ts'

export async function verifyGoldenPdfs(repositoryRoot: string, outputRoot: string): Promise<void> {
  for (const fixture of GOLDEN_FIXTURES) {
    const expected = JSON.parse(readFileSync(path.join(repositoryRoot, goldenFixturePath(fixture)), 'utf8')) as GoldenPdf
    const pdf = path.join(outputRoot, fixture.pdf)
    const actual = await readGoldenPdf(pdf)
    const difference = firstGoldenDifference(expected, actual)
    if (difference) throw new Error(goldenFailure(fixture.id, difference))
    if (fixture.taggedOutline) {
      const document = await PDFDocument.load(readFileSync(pdf), { updateMetadata: false })
      const actualLevels = pdfStructureHeadingLevels(document)
      const expectedLevels = expected.outline.map((entry) => entry.depth + 1)
      if (JSON.stringify(actualLevels) !== JSON.stringify(expectedLevels)) {
        throw new Error(`${fixture.id}: structure heading levels ${JSON.stringify(actualLevels)} differ from outline levels ${JSON.stringify(expectedLevels)}`)
      }
    }
  }
  console.log(`golden PDFs: ${GOLDEN_FIXTURES.length} fixtures match`)
}
