export function toggleTestAttribute(
  element: { hasAttribute(name: string): boolean; setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
  name: string,
  force?: boolean,
): boolean {
  const present = force ?? !element.hasAttribute(name)
  if (present) element.setAttribute(name, '')
  else element.removeAttribute(name)
  return present
}
