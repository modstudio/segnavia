import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { recordDrawingInputs } from './checks/drawing-inputs.ts'
import { currentDrawingInputRecord, DRAWING_INPUTS_RECORD, readDrawingInputRecord } from './drawing-input-state.ts'

const ROOT = path.resolve(import.meta.dir, '..')
const next = recordDrawingInputs(readDrawingInputRecord(ROOT), currentDrawingInputRecord(ROOT))
writeFileSync(path.join(ROOT, DRAWING_INPUTS_RECORD), `${JSON.stringify(next, null, 2)}\n`)
console.log(`recorded ${DRAWING_INPUTS_RECORD}`)
