export function partNumberKey(name: string): string {
  return `#${name}`
}

export function encodedPartNumbers(numbers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(numbers).map(([name, value]) => [partNumberKey(name), value]))
}
