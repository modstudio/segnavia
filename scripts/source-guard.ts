const format = import.meta.resolve('@segnavia/format')

if (!/\/packages\/format\/src\//.test(format)) {
  throw new Error(
    `Repository commands must resolve workspace packages from source, but @segnavia/format resolved to ${format}. Run repository commands through bun run.`,
  )
}
