export interface PackageChangelog {
  packageName: string
  changelogText: string
}

interface ChangeGroup {
  heading: string
  entries: string[][]
}

function versionSection(version: string, changelogText: string): string[] | undefined {
  const lines = changelogText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const start = lines.indexOf(`## ${version}`)
  if (start === -1) return undefined
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

function changeGroups(lines: string[]): ChangeGroup[] {
  const groups: ChangeGroup[] = []
  let group: ChangeGroup | undefined
  let entry: string[] | undefined

  const finishEntry = () => {
    if (!group || !entry) return
    while (entry.at(-1) === '') entry.pop()
    if (!entry[0]?.startsWith('- Updated dependencies')) group.entries.push(entry)
    entry = undefined
  }

  for (const line of lines) {
    if (line.startsWith('### ')) {
      finishEntry()
      group = { heading: line, entries: [] }
      groups.push(group)
    } else if (group && line.startsWith('- ')) {
      finishEntry()
      entry = [line]
    } else if (entry) {
      entry.push(line)
    }
  }
  finishEntry()
  return groups
}

function changelogPath(packageName: string): string {
  return `packages/${packageName.replace(/^@segnavia\//, '')}/CHANGELOG.md`
}

export function releaseNotes(version: string, changelogs: PackageChangelog[]): string {
  const seenEntries = new Set<string>()
  const packageSections: string[] = []
  let foundVersion = false

  for (const changelog of [...changelogs].sort((left, right) => left.packageName.localeCompare(right.packageName))) {
    const section = versionSection(version, changelog.changelogText)
    if (!section) continue
    foundVersion = true

    const groups: string[] = []
    for (const group of changeGroups(section)) {
      const entries = group.entries.filter((lines) => {
        const match = lines[0]?.match(/^- ([^:]+): (.+)$/)
        if (!match) return true
        const key = `${match[1]}: ${match[2]}`
        if (seenEntries.has(key)) return false
        seenEntries.add(key)
        return true
      })
      if (entries.length > 0) groups.push([group.heading, '', ...entries.flatMap((lines, index) => (index === 0 ? lines : ['', ...lines]))].join('\n'))
    }
    if (groups.length > 0) packageSections.push([`## ${changelog.packageName}`, '', ...groups].join('\n'))
  }

  if (!foundVersion) {
    const files = changelogs.map(({ packageName }) => changelogPath(packageName)).join(', ')
    throw new Error(`Could not find version ${version} in the CHANGELOG files read: ${files}.`)
  }
  return `${packageSections.join('\n\n')}\n`
}
