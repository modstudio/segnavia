import path from 'node:path'
import { verifyGoldenPdfs } from './verify/golden/index.ts'
import { REPOSITORY_ROOT } from './verify/golden/paths.ts'

await verifyGoldenPdfs(REPOSITORY_ROOT, path.join(REPOSITORY_ROOT, 'out'))
