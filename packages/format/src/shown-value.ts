// Shows a value in a refusal: JSON where it can, the value's string form where JSON cannot, and "absent" for a missing value.
export function shownValue(value: unknown): string {
  if (value === undefined) return 'absent'
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
