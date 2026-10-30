---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': minor
'@segnavia/render': minor
---

Add recursive named parts and front, body and end divisions to books, including structural contents, outlines and part running heads. A parsed `Book` carries its body as `body`; `chapters` is still accepted as input, but a host that read `book.chapters` after parsing reads `book.body` or `bookSections(book)` instead. Parts nest at most six deep, and a part with neither an opening nor a section inside it is refused.
