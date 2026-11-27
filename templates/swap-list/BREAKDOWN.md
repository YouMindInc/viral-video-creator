# Swap List — style breakdown

A **Swap List** is a faceless countdown short: "Stop paying for N apps — every one has a free version." There is no camera footage. A voice-over carries it, a cartoon mascot reacts in the corner, and every spoken beat lands on a UI card.

**Look:** light grey paper with a white perspective grid floor and drifting specks, cut against black chapter cards. One acid-lime accent (`#D4F84A`), an orange "PAID" tag, thick black outlines with hard drop shadows (a "neo-brutalist" card style), and mono type for labels.

**Rhythm:** one new card every 4–6 seconds. Inside a card, something changes on every phrase: strike-through, typing, chip, stamp.

**Captions:** bold black text, one phrase at a time, centred above the mascot. Key words sit in lime chips with a black border.

**Ending:** "Which one would you swap first?", followed by save + comment prompts.

Source: `ig_ethanhuang01/type1` (60.9 s, 720×1280, Traditional Chinese voice-over).

## Scene by scene (source)

| Time (≈) | Scene | Layout | Voice-over |
| --- | --- | --- | --- |
| 0.0–1.5 | Hook, dark | "別再為這" white → "9 個 App" huge lime → "付錢了" blurs in; a 3×3 wall of app icons with orange PAID tags drops in under the title. | 別再為這 9 個 App 付錢了 |
| 1.5–4.5 | All free, light | Title "GitHub 上{全都免費}" with a lime highlighter. The 3×3 tiles (logo + name) flip their tags from PAID to FREE one by one. A rotated "ALL FREE ON GITHUB" sticker slams in. | GitHub 上每一個都有免費版 |
| 4.5–5.8 | Chapter 01, black | Lime mono "01", "做內容" in heavy white, `CHAPTER 01 / 03 · 三個`. The chapter's three app icons pop in. | 做內容的三個 |
| 5.8–11.3 | Swap 1/9 | **Top row:** `1/9` with nine outlined squares (current = orange, done = lime), and a black pill "做內容 · 1/3".<br>**Paid bar:** a white bar (PAID tag, logo, name, `$ / 月`) slides down. On the second phrase it is struck through in red and fades, and the price becomes `$$$ → $0`.<br>**Free card:** a "↓ GitHub 上免費" label appears, then a white card with a 5 px black border and hard shadow. It holds a lime icon square, the name typed out with a cursor, the GitHub URL in mono, and the pills "● OPEN SOURCE" and "$0 / 月". Feature chips pop in on each spoken feature, then a lime "FREE" stamp lands on the card corner. | Higgsfield，換成 Open Generative AI，AI 圖片、電影級影片，600 多個模型 |
| 11.3–19.8 | Swaps 2/9, 3/9 | Same card, new app (ElevenLabs → VoiceStudio, Loom → Cap). | … |
| 19.8–21.9 | Chapter 02 | 管工作 | 再換管工作的三個 |
| 21.9–36.8 | Swaps 4–6/9 | Notion → AppFlowy, Asana → OpenProject, Wispr Flow → OpenWhispr | … |
| 36.8–39.1 | Chapter 03 | 做生意 (introduced by a full-frame lime flash) | 最後換做生意的三個 |
| 39.1–56.6 | Swaps 7–9/9 | Semrush → OpenSEO, Calendly → Cal.diy, Intercom → Chatwoot | … |
| 56.6–60.9 | Outro, light | "你最想換掉 {哪一個}？" over a 3×3 grid of mini "old → new" tiles, with the favourite outlined. A lime "記得收藏" button appears, then a comment box types "換掉 Notion！🔥", it posts as a bubble, and hearts float up. | 你最想換掉哪一個？記得收藏，留言告訴我 |

**Constant across scenes:**
- A cartoon line-art avatar sticker sits bottom left (white outline). Its expression changes per beat: neutral, grin, surprised, puzzled.
- A thin lime progress bar runs along the top.
- Captions sit about 72 % down the frame.

## How the template reproduces it

| Source element | Template |
| --- | --- |
| Hook wall + headline | `hook` scene, built from the app list. `%n` in `hook.title` becomes the count. |
| PAID → FREE flip grid + sticker | `grid` scene. Tags flip across the line, and the sticker stamps at the end of it. |
| Chapter cards | One per `chapters[]` entry (skipped when there is a single chapter with no line). |
| Swap card | One per app, using its three beats:<br>`say[0]` = paid bar;<br>`say[1]` = strike + free card typed in;<br>`say[2…]` = chips appear;<br>then the FREE stamp, and its progress square turns lime. |
| Outro grid + save + comment | `outro` scene: `pick`, `save`, `comment`. |
| Avatar with expressions | Built-in mascot (original drawing) with `neutral/happy/wow/think`, or your own image(s). It nods on every line. |
| Real logos | Letter monograms by default; `paid.icon` / `free.icon` accept images. |
| Recorded voice-over | macOS TTS per line (cached); `audio` per line for your own recording. |
| Pops, whooshes, typing, stamp thuds | Synthesised sound effects mixed under the voice (`sfx: false` to mute). |

**Differences from the source:**
- There is no full-frame lime flash between chapters; the chapter card already cuts hard to black.
- The source's emoji in the comment are left out, because emoji fonts are not available in cloud renders.
