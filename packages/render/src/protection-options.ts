import { RenderRefusedError } from './errors.ts'

export interface PdfPermissions {
  print?: 'none' | 'low' | 'high'
  copy?: boolean
  modify?: boolean
  annotate?: boolean
  fillForms?: boolean
  assemble?: boolean
}

export interface Protection {
  ownerPassword?: string
  openPassword?: string
  permissions?: PdfPermissions
}

const PROTECTION_FIELDS = new Set(['ownerPassword', 'openPassword', 'permissions'])
const PERMISSION_FIELDS = new Set(['print', 'copy', 'modify', 'annotate', 'fillForms', 'assemble'])

function object(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RenderRefusedError(`The ${field} field needs an object; pass an object, or omit ${field} to clear this refusal.`)
  }
  return value as Record<string, unknown>
}

function knownFields(value: Record<string, unknown>, fields: Set<string>, field: string): void {
  const unknown = Object.keys(value).find((name) => !fields.has(name))
  if (unknown) throw new RenderRefusedError(`The ${field}.${unknown} field is unknown; remove it to clear this refusal.`)
}

function password(value: unknown, field: 'ownerPassword' | 'openPassword'): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw new RenderRefusedError(
      `The protection.${field} field needs a non-empty string; pass a non-empty password, or omit protection.${field} to clear this refusal.`,
    )
  }
  return value
}

function permissions(value: unknown): PdfPermissions | undefined {
  if (value === undefined) return undefined
  const input = object(value, 'protection.permissions')
  knownFields(input, PERMISSION_FIELDS, 'protection.permissions')
  if (input.print !== undefined && input.print !== 'none' && input.print !== 'low' && input.print !== 'high') {
    throw new RenderRefusedError(
      "The protection.permissions.print field needs 'none', 'low', or 'high'; pass one of those values, or omit protection.permissions.print for high-quality printing to clear this refusal.",
    )
  }
  for (const field of ['copy', 'modify', 'annotate', 'fillForms', 'assemble'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') {
      throw new RenderRefusedError(
        `The protection.permissions.${field} field needs a boolean; pass true or false, or omit protection.permissions.${field} for false to clear this refusal.`,
      )
    }
  }
  return { ...input } as PdfPermissions
}

export function parseProtection(value: unknown): Protection | undefined {
  if (value === undefined) return undefined
  const input = object(value, 'protection')
  knownFields(input, PROTECTION_FIELDS, 'protection')
  return {
    ...(input.ownerPassword === undefined ? {} : { ownerPassword: password(input.ownerPassword, 'ownerPassword') }),
    ...(input.openPassword === undefined ? {} : { openPassword: password(input.openPassword, 'openPassword') }),
    ...(input.permissions === undefined ? {} : { permissions: permissions(input.permissions) }),
  }
}
