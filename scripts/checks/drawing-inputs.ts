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

export function checkDrawingInputs(record: DrawingInputRecord, current: DrawingInputState): string[] {
  const versionsMatch = current.image === record.image && current.cover === record.cover
  if (current.fingerprint === record.fingerprint) return versionsMatch ? [] : [staleRecordMessage()]

  const bothRose = current.image > record.image && current.cover > record.cover
  if (bothRose) return [staleRecordMessage()]

  const changed = current.changedFiles.length > 0 ? current.changedFiles.join(', ') : 'the declared drawing inputs'
  return [
    `drawing inputs changed (${changed}) without raising both versions; raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION, then run bun run drawing:record.`,
  ]
}

export function recordDrawingInputs(record: DrawingInputRecord, current: Omit<DrawingInputState, 'changedFiles'>): DrawingInputRecord {
  if (current.fingerprint !== record.fingerprint && !(current.image > record.image && current.cover > record.cover)) {
    throw new Error(
      'drawing inputs changed without raising both versions; raise IMAGE_DRAWING_VERSION and COVER_DRAWING_VERSION before running bun run drawing:record.',
    )
  }
  return current
}
