# Decisions

Each decision states what holds and why. Challenge one with evidence and a
replacement, and record the new ruling here.

## Product

**Layers stay separate and uncompiled.** Images, narration text, audio and
timings are separate files tied together by a deck. Swapping a slide,
re-voicing a line or recapturing a screen changes only that piece. Every
comparable tool surveyed (`docs/research.md`) compiles to a video file, which
is the gap this fills.

**Narration drives the pace.** A slide's length comes from its narration's
word timings, and cues are bound to words. Fixed durations drift from the
voice. That drift is where tools like this usually fail.

**A tutorial is a deck.** There are static slides and slides that play.
Speaker notes are already on every slide in both studios, so they are close
to narration already.

**A page is not paper.** A page is designed for the web at any size. Paper is
only an export setting.

## Shape of the library

**It is a library with seams it owns.** No host's specifics live in it. Each
host implements the seams in its own repository. A need that does not fit
becomes a new seam, designed here.

**It is extracted before the second feature, not after.** Building inside the
first app and extracting later is where tools like this die. The capture
engine moved out of the first capture host as soon as a second consumer
(playing decks) existed.

**There are separate packages in one repository.** A host takes only what it
uses, for example the viewer without capture. A playing slide is a deck
slide, so it all lives in one repository.

**Code never names a host.** It is enforced by `checkHostNames`, using names
from `host-names.local`. Adoption notes live with each host.

## Capture

**A clean image plus measured geometry is the primary output.** Drawing
annotations into the image would stop a viewer showing them on cue. The
annotated rendition is still available for pages that embed a still image.

**Geometry belongs to the image version it was measured on.** A recapture can
move an element, and coordinates stored apart from their image go stale. A
host serves both together as a `PublishedShot`. A deck names the shot by
address (`shot-ref`), so a recapture reaches every deck.

**A target must match exactly one visible element.** A missing element means
the screen changed, and an ambiguous one means the annotation could land on
the wrong thing. Either way a person must look, so the flow fails and names
the step.

**A named arrow side is drawn there or not at all.** Moving the arrow
silently could point it at something the narration does not describe.

## Viewing

**There is one frame model for every host.** It is sandboxed with
`allow-scripts` and never `allow-same-origin`. Under `scripts: 'refuse'` a
nonce CSP blocks author scripts while the library's bridge runs. This keeps
one host's rule (no author scripts) and another host's behaviour (keys pressed
inside a slide still page the deck) at once. The first host's key relay never
worked under refused scripts; this design closes that gap.

**Messages are trusted by `event.source` only.** A sandboxed frame's
`origin` is `"null"` and proves nothing. Only a paging key's name, a height
and a ready signal cross.

**Every block of text takes its own direction.** A page's `dir` lays out the
page, but each paragraph, heading and list item reads in the direction of its
first letter (`BLOCK_DIRECTION_CSS`). An English sentence on a right-to-left
page keeps its full stop on the right, and aligns to its own start. The rule
has zero specificity, so a host's CSS or an author's `dir` always wins.

**Height reports are batched with a timer.** A browser may stop animation
frames in a cross-origin frame that is off screen. A report batched on an
animation frame was then never sent, and the page kept its placeholder height.

**Pages measure the root element's box.** `scrollHeight` is never less than
the frame's own viewport, so a frame would never shrink to a short page.

**Viewing is headless; the skin is optional.** Each host has its own design
system. One host's rules forbid hand-rolled controls, another uses Tailwind,
and another uses Vue. A host builds controls from `DeckController` with its own
components, on a stage that brings only geometry, all at zero specificity.
`<segnavia-player>` is a finished skin for hosts that want to use the
library as it is, so it is designed to look right without any host styling.
It lives in a separate entry point that a headless host never loads.

**Styled components sit between the two.** A host may want a finished
caption or track but its own buttons. Each control is its own element,
connected to a stage by `for`, and the player is only a layout of them, so
the player and the components cannot look or behave differently.

**Light and dark follow `color-scheme`.** Every colour falls back to
`light-dark()`, so a host's own theme switch reaches the components with no
wiring, and the player's `theme` only sets its `color-scheme`.

**The elements are Web Components with no framework.** A custom element
works in Vue, React and plain HTML alike, and a framework wrapper is a thin
hook over the controller.

**Arrow keys follow reading direction.** In a right-to-left deck the left
arrow moves forward, as horizontal navigation does in a right-to-left
interface. Page keys and Space do not mirror.

**The slide counter is isolated left to right.** In a right-to-left context
the neutral slash reorders `3 / 4` into `4 / 3`.

**A paused or static shot shows every annotation, as print does.** Only a
playing slide reveals them on cue.

## Rendering

**One print document serves both browser and server.** `printableDeck` is
used by `printDeck` (the browser dialog, after every slide reports ready or
the deadline passes) and by `deckPdf` (headless). Two layouts would drift.

**Rendering is offline by construction.** Everything a document shows
arrives inside it.

**A grown page is measured with the viewport collapsed.** A document is
never shorter than its viewport.

## Voice

**Synthesis is cached by content.** The cache key is provider, voice and
text. Editing one slide re-voices that slide only, and playback is
deterministic.

**An aligner that loses a word is refused.** One missing word would shift
every cue after it.

**Live speech is for drafts.** Browser voices sound robotic and their timing
varies by engine. A deck that ships uses recorded narration.

## Stack

**Bun workspaces, TypeScript, Zod 4, Biome, `playwright-core`.** These match
multiple hosts. `playwright-core` runs under Bun in one host's production and
in this repository's demo. Another host runs Node, so capture and render must
also be proven under Node (`docs/roadmap.md`).

**Zod schemas are the source of the JSON Schema.** A PHP host reads the
generated schema; it cannot import TypeScript types.

**htmlparser2 parses HTML.** It is what one host's format package already
uses, and it runs in both runtimes.

**The library has no Remotion dependency.** Remotion's Player can play a
composition live, but a company of more than three people embedding it in a
product needs the paid automation licence. The player here is a few hundred
lines over an audio clock, which is all the job needs.

**The licence is MIT and the repository is public.**
