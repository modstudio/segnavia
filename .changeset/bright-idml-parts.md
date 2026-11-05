---
'@segnavia/idml': minor
---

Add `inspectIdml` and answer-driven IDML part mapping. Imports whose source offers ambiguous structure now refuse with the open question and its candidate labels; inspect the file, choose from its previews, and pass the choice through `answers` to clear the refusal.
