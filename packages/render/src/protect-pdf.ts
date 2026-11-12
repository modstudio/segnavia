import { fileURLToPath } from 'node:url'
import createQpdf, { type QpdfInstance } from '@neslinesli93/qpdf-wasm'
import type { Limits } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { enforcePdfBytes } from './pdf-finish.ts'
import { type Protection, permissionArguments } from './protection-options.ts'
import type { RenderDeadline } from './render-deadline.ts'

export interface WritableQpdf extends QpdfInstance {
  FS: QpdfInstance['FS'] & {
    unlink(path: string): void
    writeFile(path: string, bytes: Uint8Array): void
  }
}

export type QpdfLoader = () => Promise<WritableQpdf>

export interface PdfProtector {
  (pdf: Uint8Array, protection: Protection): Promise<Uint8Array>
  dispose(): Promise<void>
}

export interface ProtectPdf {
  (pdf: Uint8Array, options: { limits?: Limits; protection?: Protection }, deadline: RenderDeadline): Promise<Uint8Array>
  dispose(): Promise<void>
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

export function generatedOwnerPassword(): string {
  return `A${base64Url(crypto.getRandomValues(new Uint8Array(32)))}`
}

export function loadQpdf(): Promise<WritableQpdf> {
  const hostConsole = Reflect.get(globalThis, 'console') as Console
  const print = hostConsole.log
  const printErr = hostConsole.error
  // This build binds the host console directly and ignores print and printErr.
  hostConsole.log = () => {}
  hostConsole.error = () => {}
  try {
    return createQpdf({
      locateFile: () => fileURLToPath(new URL('qpdf.wasm', import.meta.resolve('@neslinesli93/qpdf-wasm'))),
      noInitialRun: true,
      print: () => {},
      printErr: () => {},
    } as never) as Promise<WritableQpdf>
  } finally {
    hostConsole.log = print
    hostConsole.error = printErr
  }
}

export function runQpdf(instance: WritableQpdf, arguments_: string[]): number {
  const exitCode = process.exitCode
  try {
    return instance.callMain(arguments_)
  } finally {
    process.exitCode = exitCode
  }
}

export function createPdfProtector(dependencies: { loadQpdf?: QpdfLoader; ownerPassword?: () => string } = {}): PdfProtector {
  let qpdf: Promise<WritableQpdf> | undefined
  let queue = Promise.resolve()
  let fileNumber = 0

  const qpdfModule = (): Promise<WritableQpdf> => {
    if (!qpdf) {
      try {
        qpdf = (dependencies.loadQpdf ?? loadQpdf)().catch((error) => {
          qpdf = undefined
          throw error
        })
      } catch (error) {
        return Promise.reject(error)
      }
    }
    return qpdf
  }

  const encrypt = async (pdf: Uint8Array, protection: Protection): Promise<Uint8Array> => {
    let instance: WritableQpdf
    try {
      instance = await qpdfModule()
    } catch {
      throw new Error('qpdf could not be loaded; the next render retries.')
    }
    const number = fileNumber++
    const input = `/segnavia-protect-${number}-input.pdf`
    const output = `/segnavia-protect-${number}-output.pdf`
    const ownerPassword = protection.ownerPassword ?? (dependencies.ownerPassword ?? generatedOwnerPassword)()
    instance.FS.writeFile(input, pdf)
    try {
      let status: number
      try {
        status = runQpdf(instance, [
          '--encrypt',
          protection.openPassword ?? '',
          ownerPassword,
          '256',
          ...permissionArguments(protection.permissions),
          '--accessibility=y',
          '--',
          input,
          output,
        ])
      } catch {
        throw new RenderRefusedError('qpdf could not protect the input PDF because its run threw; render without protection, or report the document.')
      }
      if (status !== 0 && status !== 3) {
        throw new RenderRefusedError(
          `qpdf could not protect the input PDF because it returned status ${status}; render without protection, or report the document.`,
        )
      }
      return new Uint8Array(instance.FS.readFile(output))
    } finally {
      instance.FS.unlink(input)
      try {
        instance.FS.unlink(output)
      } catch {}
    }
  }

  const protect: PdfProtector = (pdf, protection) => {
    const result = queue.then(() => encrypt(pdf, protection))
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
  protect.dispose = async () => {
    while (true) {
      const pending = queue
      await pending
      if (queue === pending) {
        qpdf = undefined
        return
      }
    }
  }
  return protect
}

export function createProtectPdf(dependencies: { loadQpdf?: QpdfLoader; ownerPassword?: () => string } = {}): ProtectPdf {
  const protector = createPdfProtector(dependencies)
  const protect: ProtectPdf = async (pdf, options, deadline) => {
    if (deadline.signal.aborted) throw deadline.signal.reason
    return options.protection ? enforcePdfBytes(await protector(pdf, options.protection), options.limits) : pdf
  }
  protect.dispose = () => protector.dispose()
  return protect
}
