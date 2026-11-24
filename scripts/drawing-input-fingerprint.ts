import { createHash } from 'node:crypto'

export interface DrawingInputSource {
  path: string
  text: string
}

export interface DrawingFingerprintInput {
  files: readonly DrawingInputSource[]
  noNetworkArgs: readonly string[]
  playwrightCore: string
}

export function drawingInputFingerprint(input: DrawingFingerprintInput): string {
  const files = [...input.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path, text }) => ({ path, text: text.replace(/\r\n/g, '\n') }))
  const material = JSON.stringify({ files, playwrightCore: input.playwrightCore, noNetworkArgs: [...input.noNetworkArgs] })
  return createHash('sha256').update(material).digest('hex')
}
