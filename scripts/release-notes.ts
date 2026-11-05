export interface PackageChangelog {
  packageName: string
  changelogPath: string
  changelogText: string
}

interface ChangeEntry {
  text: string
  lines: string[]
  kind: 'change' | 'dependency'
}

interface ChangeGroup {
  heading: string
  entries: ChangeEntry[]
}

function versionSection(version: string, changelogText: string): string[] | undefined {
  const lines = changelogText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const start = lines.indexOf(`## ${version}`)
  if (start === -1) return undefined
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  return lines.slice(start + 1, end === -1 ? undefined : end)
}

function changeGroups(sectionLines: string[]): ChangeGroup[] {
  const groups: ChangeGroup[] = []
  let group: ChangeGroup | undefined
  let lines: string[] | undefined

  const finishEntry = () => {
    if (!group || !lines) return
    while (lines.at(-1) === '') lines.pop()
    const firstLine = lines[0]
    if (!firstLine) return
    group.entries.push({
      text: firstLine.slice(2),
      lines,
      kind: firstLine.startsWith('- Updated dependencies') || /^- @segnavia\/[^@\s]+@\S+$/.test(firstLine) ? 'dependency' : 'change',
    })
    lines = undefined
  }

  for (const line of sectionLines) {
    if (line.startsWith('### ')) {
      finishEntry()
      group = { heading: line, entries: [] }
      groups.push(group)
    } else if (group && line.startsWith('- ')) {
      finishEntry()
      lines = [line]
    } else if (lines) {
      lines.push(line)
    }
  }
  finishEntry()
  return groups
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
      const entries = group.entries.filter((entry) => {
        if (entry.kind === 'dependency') return false
        if (seenEntries.has(entry.text)) return false
        seenEntries.add(entry.text)
        return true
      })
      if (entries.length > 0)
        groups.push([group.heading, '', ...entries.flatMap((entry, index) => (index === 0 ? entry.lines : ['', ...entry.lines]))].join('\n'))
    }
    if (groups.length > 0) packageSections.push([`## ${changelog.packageName}`, ...groups].join('\n\n'))
  }

  if (!foundVersion) {
    const files = changelogs.map(({ changelogPath }) => changelogPath).join(', ')
    throw new Error(
      `Could not find version ${version} in the CHANGELOG files read: ${files}. Run bun run version so each package changelog gains a section for ${version}, then release again.`,
    )
  }
  return `${packageSections.join('\n\n')}\n`
}
