import { markdownHtml } from '@segnavia/html'

function tableRows(hebrew: boolean, count: number): string {
  const letters = hebrew ? 'אבגדהוזחטיכלמנסעפצקרשת' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from({ length: count }, (_, index) => `<tr><td>${letters[index % letters.length]}</td><td>${index + 1}</td></tr>`).join('')
}

export function wrappedTableHtml(hebrew: boolean): string {
  const headings = hebrew ? ['אות עטופה', 'ערך עטוף'] : ['Wrapped letter', 'Wrapped value']
  const letters = hebrew ? 'אבגדהוזחטיכלמנסעפצקרשת' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const rows = Array.from({ length: 46 }, (_, index) => `| ${letters[index % letters.length]} | ${index + 1} |`).join('\n')
  return markdownHtml(`| ${headings[0]} | ${headings[1]} |\n| --- | --- |\n${rows}`, { dir: hebrew ? 'rtl' : 'ltr', lang: hebrew ? 'he' : 'en' })
}

export function marginTableHtml(hebrew: boolean): string {
  const head = hebrew ? '<th>אות בשוליים</th><th>ערך בשוליים</th>' : '<th>Margin letter</th><th>Margin value</th>'
  return `<table style="margin-top:24px"${hebrew ? ' dir="rtl"' : ''}><thead><tr>${head}</tr></thead><tbody>${tableRows(hebrew, 46)}</tbody></table>`
}
