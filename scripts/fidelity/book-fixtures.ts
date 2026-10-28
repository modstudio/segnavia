import path from 'node:path'
import { Book, type BookInput } from '@segnavia/format'
import type { BookFixture } from './types.ts'

const ROOT = path.resolve(import.meta.dir, '../..')

export const ENGLISH_BOOK_ID = 'control-book-en'
export const HEBREW_BOOK_ID = 'control-book-he'
export const SHIFTED_BOOK_ID = `${ENGLISH_BOOK_ID}-shifted`
export const FAULT_CONTROL_PAGE = 2

export const BOOK_FACE_CSS =
  'html{font:16px/1.5 Arial,sans-serif;background:#fff;color:#111}html[lang="he"]{font-family:Arial,"Noto Sans Hebrew",sans-serif}[data-segnavia-book-page]{background:#fff}[data-segnavia-head],[data-segnavia-foot]{font-size:11px;line-height:1.3}'

const page = { paper: 'a5' as const, margin: { top: 16, bottom: 18, inner: 16, outer: 12 } }

function filled(html: string, hebrew: boolean): string {
  if (!hebrew) return html
  const sentence = 'עוֹד מִשְׁפָּט עַל הַיָּם וְעַל הַנָּמֵל שֶׁמְּמַלֵּא אֶת הָעַמּוּד הַשְּׁלִישִׁי בְּפִסְקָה אַחַת. '
  return `${html}<p data-fidelity="third-page">${sentence.repeat(24)}</p>`
}

function controlBook(id: 'en' | 'he', html: string): BookInput {
  const hebrew = id === 'he'
  return {
    title: hebrew ? 'ספר הַנָּמֵל' : 'The Harbour Book',
    mode: 'paginated',
    lang: hebrew ? 'he' : 'en',
    page,
    chapters: [{ title: hebrew ? 'הַנָּמֵל' : 'The Harbour', html: filled(html, hebrew) }],
  }
}

export async function bookFixtures(): Promise<BookFixture[]> {
  const english = await Bun.file(path.join(ROOT, 'fixtures/fidelity/control-book-en.html')).text()
  const hebrew = await Bun.file(path.join(ROOT, 'fixtures/fidelity/control-book-he.html')).text()
  return [
    { id: ENGLISH_BOOK_ID, title: 'English control book', kind: 'control', book: Book.parse(controlBook('en', english)) },
    { id: HEBREW_BOOK_ID, title: 'Hebrew control book', kind: 'control', book: Book.parse(controlBook('he', hebrew)) },
  ]
}
