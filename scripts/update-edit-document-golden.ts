import { editDocumentBookFixture } from '../packages/html/src/edit-document.fixture.ts'

if (!Bun.argv.includes('--update-golden')) throw new Error('pass --update-golden to replace the editDocument JSON golden')
await Bun.write(new URL('../packages/html/src/edit-document.golden.json', import.meta.url), `${JSON.stringify(editDocumentBookFixture().golden, null, 2)}\n`)
