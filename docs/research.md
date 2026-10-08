# Research

What exists elsewhere, surveyed before building, including negative results
so the search is not repeated.

## Comparable tools

| Tool | What it is | Why it is not this |
|---|---|---|
| [screenwright](https://skillsmp.com/creators/guidupuy/screenwright/skill) | Playwright end-to-end tests turned into narrated MP4 demo videos | Compiles to video. |
| demos-not-memos (markng) | A TypeScript DSL for narrated demo videos with ElevenLabs and Playwright | Compiles to video. |
| [playwright-recast](https://www.claudepluginhub.com/plugins/thepatriczek-playwright-recast-claude-playwright-recast) | Playwright traces to video, with voiceover, subtitles and zoom | Compiles to video. |
| [demodsl](https://pypi.org/project/demodsl/) | A Python YAML DSL with Playwright capture and many voice providers | Compiles to video. |
| [devreel](https://github.com/BLamy/devreel) | Live in-browser lessons: a real editor, preview, terminal and database driven on a timeline synced to ElevenLabs narration | The closest idea: live and uncompiled. But it is early (no stars, no stated licence), has no slides or screenshots, and its `lesson.json` is undocumented. A source of ideas for a live-app slide. |
| Arcade, Guidde, Synthesia, Descript | Commercial recorders and generators | Recordings or prompts in, finished videos out. Nothing scriptable or declarative. |

## Players

| Option | Finding |
|---|---|
| [Remotion Player](https://cloudrun.remotion.dev/docs/player/player) | Plays a composition live without rendering. A company of more than three people embedding it in a product needs the automation licence ([pricing](https://www.remotion.dev/docs/license/pricing)). Not used. |
| [Revideo player](https://docs.re.video/api/player-react/player) | A Motion Canvas fork with a React player and low adoption. Its licence was not confirmed. Not used. |
| A small custom element over an audio clock | What the job needs. Built here. |

## Voice and timing

| Option | Finding |
|---|---|
| [ElevenLabs with timestamps](https://elevenlabs.io/docs/api-reference/streaming-with-timestamps) | `POST /v1/text-to-speech/{voice}/with-timestamps` returns base64 audio and character start and end times in seconds; a streaming variant exists. `normalized_alignment` follows the spoken text after number expansion. |
| Kokoro, via [Kokoros](https://docsearch.algolia.com/mcp/docs/repo/lucasjinreal/kokoros) or [HeadTTS](https://gittrend.io/repo/met4citizen/HeadTTS) | Local and free, with word timestamps reported. Accounts of how they are produced disagree, and quality is uneven outside English. |
| Forced alignment, such as Wav2Vec2-CTC ([one pipeline](https://phabricator.wikimedia.org/T427488)) | Aligns any engine's audio with its text afterwards. This is why `alignedProvider` takes an aligner. |
| The browser's Web Speech API | Word boundary events need no audio file, but voices sound robotic and timing varies by engine. For drafts only. |

## In the hosts

Three prospective hosts were surveyed. None had speech, captions, word
timings or a synced player. One host's music player drives sound and sheet
position from one clock, which is the pattern `DeckController` follows.
