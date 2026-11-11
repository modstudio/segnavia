import { z } from 'zod'
import { EXPORTED_SCHEMAS } from './exported-schema-manifest.ts'
import { FontDeclarationWeight } from './fonts.ts'

export function jsonSchemas() {
  return Object.fromEntries(
    Object.entries(EXPORTED_SCHEMAS).map(([name, schema]) => [
      name,
      z.toJSONSchema(schema, {
        io: 'input',
        override: ({ zodSchema, jsonSchema }) => {
          if (zodSchema !== FontDeclarationWeight || !jsonSchema.anyOf) return
          jsonSchema.oneOf = jsonSchema.anyOf
          delete jsonSchema.anyOf
        },
      }),
    ]),
  )
}
