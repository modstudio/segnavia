/** The shortest string whose repetition spells the value: a symbol entry printed n times shares its root with every power of itself. */
export function primitiveRoot(value: string): string {
  for (let length = 1; length <= value.length; length += 1) {
    if (value.length % length !== 0) continue
    const candidate = value.slice(0, length)
    if (candidate.repeat(value.length / length) === value) return candidate
  }
  return value
}
