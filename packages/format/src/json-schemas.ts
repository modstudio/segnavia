import { z } from 'zod'
import { EXPORTED_SCHEMAS } from './exported-schema-manifest.ts'

export function jsonSchemas() {
  return Object.fromEntries(Object.entries(EXPORTED_SCHEMAS).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input' })]))
}
