export type ReleaseType = 'patch' | 'minor' | 'major'

export interface ChangesetRelease {
  name: string
  type: ReleaseType
}

export interface DeclaredChangeset {
  releases: ChangesetRelease[]
}

export interface ReleasePlanFinding {
  name: string
  planned: ReleaseType
  declaredMaximum: ReleaseType
}

const RELEASE_RANK: Record<ReleaseType, number> = { patch: 0, minor: 1, major: 2 }

export function checkReleasePlan(changesets: DeclaredChangeset[], planned: ChangesetRelease[]): ReleasePlanFinding[] {
  const declared = changesets.flatMap((changeset) => changeset.releases)
  if (declared.length === 0) return []
  const declaredMaximum = declared.reduce<ReleaseType>(
    (highest, release) => (RELEASE_RANK[release.type] > RELEASE_RANK[highest] ? release.type : highest),
    'patch',
  )
  return planned
    .filter((release) => RELEASE_RANK[release.type] > RELEASE_RANK[declaredMaximum])
    .map((release) => ({ name: release.name, planned: release.type, declaredMaximum }))
}
