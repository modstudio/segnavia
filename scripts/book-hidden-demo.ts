import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function writeHiddenBookDemo(site: string) {
  writeFileSync(
    path.join(site, 'book-paginated-hidden.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Initially hidden paginated book elements</title><style>
      html,body{margin:0}.books{display:grid;grid-template-columns:1fr 1fr;gap:16px}.books.hidden{visibility:hidden;inline-size:0;block-size:0;overflow:hidden}segnavia-book{display:block;block-size:70vh}
    </style></head><body><main class="books hidden"><segnavia-book id="book-hidden-en" src="book-paginated-en.json"></segnavia-book><segnavia-book id="book-hidden-he" src="book-paginated-he.json"></segnavia-book></main><main class="books"><segnavia-book id="book-hidden-frame-en" layout="flow" src="book-paginated-en.json"></segnavia-book><segnavia-book id="book-hidden-frame-he" layout="flow" src="book-paginated-he.json"></segnavia-book></main><script type="module" src="segnavia.js"></script><script>setTimeout(function(){document.querySelector('.books.hidden').classList.remove('hidden');document.querySelectorAll('[id^="book-hidden-frame-"]').forEach(function(book){book.setAttribute('layout','pages')})},2000)</script></body></html>`,
  )
}
