import path from 'node:path'
import { verifyGoldenPdfs } from './verify/golden/index.ts'

await verifyGoldenPdfs(path.resolve(import.meta.dirname, '..'))
