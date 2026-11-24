export interface DrawingInputRecord {
  image: number
  cover: number
  fingerprint: string
}

export interface DrawingInputState {
  image: number
  cover: number
  fingerprint: string
  changedFiles: readonly string[]
}

function staleRecordMessage(): string {
  return 'drawing versions changed without updating drawing-inputs.json; run bun run drawing:record.'
}

export type DrawingBumpStatus = 'current' | 'needs-record' | 'needs-bump'

export function drawingBumpStatus(record: DrawingInputRecord, current: Pick<DrawingInputState, 'image' | 'cover' | 'fingerprint'>): DrawingBumpStatus {
  if (current.fingerprint === record.fingerprint) {
    return current.image === record.image && current.cover === record.cover ? 'current' : 'needs-record'
  }
  return current.image > record.image && current.cover > record.cover ? 'needs-record' : 'needs-bump'
}

export function checkDrawingInputs(record: DrawingInputRecord, current: DrawingInputState): string[] {
  const status = drawingBumpStatus(record, current)
  if (status === 'current') return []
  if (status === 'needs-record') return [staleRecordMessage()]

  const changed = current.changedFiles.length > 0 ? current.changedFiles.join(', ') : 'the declared drawing inputs'
  return [
    `drawing inputs changed (${changed}) without raising both versions; raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION, then run bun run drawing:record.`,
  ]
}

export function recordDrawingInputs(record: DrawingInputRecord, current: Omit<DrawingInputState, 'changedFiles'>): DrawingInputRecord {
  if (drawingBumpStatus(record, current) === 'needs-bump') {
    throw new Error(
      'drawing inputs changed without raising both versions; raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION before running bun run drawing:record.',
    )
  }
  return current
}
