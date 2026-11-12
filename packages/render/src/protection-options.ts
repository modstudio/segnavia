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

export interface PdfOptions {
  protection?: Protection
}

const PROTECTION_FIELDS = new Set(['ownerPassword', 'openPassword', 'permissions'])
const PERMISSION_TABLE = {
  print: { argument: 'print', defaultValue: 'high', enabledValue: 'full', disabledValue: 'none' },
  copy: { argument: 'extract', defaultValue: false, enabledValue: 'y', disabledValue: 'n' },
  modify: { argument: 'modify', defaultValue: false, enabledValue: 'all', disabledValue: 'none' },
  annotate: { argument: 'annotate', defaultValue: false, enabledValue: 'y', disabledValue: 'n' },
  fillForms: { argument: 'form', defaultValue: false, enabledValue: 'y', disabledValue: 'n' },
  assemble: { argument: 'assemble', defaultValue: false, enabledValue: 'y', disabledValue: 'n' },
} as const
const PERMISSION_FIELDS = new Set(Object.keys(PERMISSION_TABLE))
type BooleanPermission = Exclude<keyof PdfPermissions, 'print'>

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
  if (value.startsWith('-')) {
    throw new RenderRefusedError(`The protection.${field} field is not safe for qpdf; a password may not begin with '-' to clear this refusal.`)
  }
  if (value.includes('\0')) {
    throw new RenderRefusedError(`The protection.${field} field contains U+0000; remove U+0000 from the password to clear this refusal.`)
  }
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) index += 1
      else throw new RenderRefusedError(`The protection.${field} field contains an unpaired surrogate; remove the unpaired surrogate to clear this refusal.`)
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new RenderRefusedError(`The protection.${field} field contains an unpaired surrogate; remove the unpaired surrogate to clear this refusal.`)
    }
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
  const parsed: PdfPermissions = {}
  if (input.print !== undefined) parsed.print = input.print
  for (const field of Object.keys(PERMISSION_TABLE).filter((field): field is BooleanPermission => field !== 'print')) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') {
      throw new RenderRefusedError(
        `The protection.permissions.${field} field needs a boolean; pass true or false, or omit protection.permissions.${field} for false to clear this refusal.`,
      )
    }
    if (typeof input[field] === 'boolean') parsed[field] = input[field]
  }
  return parsed
}

export function permissionArguments(permissions: PdfPermissions = {}): string[] {
  return Object.entries(PERMISSION_TABLE).map(([field, rule]) => {
    const value = permissions[field as keyof PdfPermissions] ?? rule.defaultValue
    const argumentValue = field === 'print' ? (value === 'high' ? 'full' : value) : value ? rule.enabledValue : rule.disabledValue
    return `--${rule.argument}=${argumentValue}`
  })
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

export function parsePdfOptions<T extends PdfOptions>(options: T): T {
  return { ...options, protection: parseProtection(options.protection) }
}
