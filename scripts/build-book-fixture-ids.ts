export const fixtureIds = () => {
  let id = 0
  return () => `fixture-${++id}`
}
