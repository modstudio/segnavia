export function refusal(subject: string, clear: string): Error {
  return new Error(`${subject}; ${clear} to clear this refusal`)
}
