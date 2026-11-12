import { fileURLToPath } from 'node:url'
import createQpdf, { type QpdfInstance } from '@neslinesli93/qpdf-wasm'
import type { Protection } from './protection-options.ts'

interface WritableQpdf extends QpdfInstance {
  FS: QpdfInstance['FS'] & {
    unlink(path: string): void
    writeFile(path: string, bytes: Uint8Array): void
  }
}

function base64Url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let result = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] as number
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    result += alphabet[first >> 2]
    result += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)]
    if (second !== undefined) result += alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)]
    if (third !== undefined) result += alphabet[third & 63]
  }
  return result
}

function generatedOwnerPassword(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

function yes(value: boolean | undefined): 'y' | 'n' {
  return value ? 'y' : 'n'
}

export function createPdfProtector(): (pdf: Uint8Array, protection: Protection) => Promise<Uint8Array> {
  let qpdf: Promise<WritableQpdf> | undefined
  let queue = Promise.resolve()
  let fileNumber = 0

  const qpdfModule = (): Promise<WritableQpdf> => {
    qpdf ??= createQpdf({
      locateFile: () => fileURLToPath(new URL('qpdf.wasm', import.meta.resolve('@neslinesli93/qpdf-wasm'))),
      noInitialRun: true,
    } as never) as Promise<WritableQpdf>
    return qpdf
  }

  const encrypt = async (pdf: Uint8Array, protection: Protection): Promise<Uint8Array> => {
    const instance = await qpdfModule()
    const number = fileNumber++
    const input = `/segnavia-protect-${number}-input.pdf`
    const output = `/segnavia-protect-${number}-output.pdf`
    const permissions = protection.permissions ?? {}
    const ownerPassword = protection.ownerPassword ?? generatedOwnerPassword()
    instance.FS.writeFile(input, pdf)
    try {
      let status: number
      try {
        status = instance.callMain([
          '--encrypt',
          protection.openPassword ?? '',
          ownerPassword,
          '256',
          `--print=${permissions.print === 'none' ? 'none' : permissions.print === 'low' ? 'low' : 'full'}`,
          `--modify=${permissions.modify ? 'all' : 'none'}`,
          `--extract=${yes(permissions.copy)}`,
          `--annotate=${yes(permissions.annotate)}`,
          `--form=${yes(permissions.fillForms)}`,
          `--assemble=${yes(permissions.assemble)}`,
          '--accessibility=y',
          '--',
          input,
          output,
        ])
      } catch {
        throw new Error('qpdf could not protect the PDF.')
      }
      if (status !== 0) throw new Error(`qpdf returned status ${status} while protecting the PDF.`)
      return new Uint8Array(instance.FS.readFile(output))
    } finally {
      instance.FS.unlink(input)
      try {
        instance.FS.unlink(output)
      } catch {}
    }
  }

  return (pdf, protection) => {
    const result = queue.then(() => encrypt(pdf, protection))
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

export const protectPdf = createPdfProtector()
