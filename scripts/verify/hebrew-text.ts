export const POINTS = /[\u0591-\u05c7]/g

// Poppler reorders combining marks in RTL runs, so points are compared as a multiset and logical order
// without them. Single-point placement is held by eye checks outside the repository.
export const unpointed = (value: string): string => value.normalize('NFC').replace(POINTS, '').replace(/\s+/g, '')

export const pointMultiset = (value: string): string =>
  [...value.normalize('NFC').matchAll(POINTS)]
    .map(([point]) => point)
    .sort()
    .join('')
