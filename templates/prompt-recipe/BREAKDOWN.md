# Prompt Recipe — style breakdown

**Prompt Recipe** is a static 9:16 "formula" poster: *prompt card + reference image → model name → AI result*.
The viewer reads it like a recipe while the generated clip plays. The genre is AI-generation showcases.
This file analyses three reference posts (`ig-aibyaish/type1`) and maps them onto this template.

## Source videos

| File | Length | Audio | Layout | Result |
|---|---|---|---|---|
| `Df9lv2tBAFV` | 10.0 s · 30 fps | none | **tall** | portrait 9:16 walkthrough |
| `DgCakoABxSd` | 7.9 s · 30 fps | music | **wide** | landscape 16:9 product ad |
| `DgKClheBbPY` | 7.9 s · 30 fps | music | **wide** | landscape 16:9 product ad |

## Scene by scene

None of the three posts has a single cut: scene detection finds no cuts above 0.2. Each post is **one scene**: the layout never moves, and only the embedded result clip changes.

**`Df9lv2tBAFV` (tall)**

| Time | What happens |
|---|---|
| 0.0–10.0 | The static recipe stays on screen the whole time. |
| 0.0–2.5 | Inside the result: a woman walks through a bare construction shell; the room "builds itself" around her. |
| 2.5–7.0 | Inside the result: the finished living room from the reference image (chandelier, green sofa, marble floor). |
| 7.0–8.0 | Inside the result: she passes through a doorway. |
| 8.0–10.0 | Inside the result: a finished bedroom. The end. |

**`DgCakoABxSd` (wide)**

| Time | What happens |
|---|---|
| 0.0–7.9 | The static recipe stays on screen. |
| 0.0–1.0 | Inside the result: a toy nutcracker walks in. |
| 1.0–4.5 | Inside the result: it drags the perfume bottle into frame by its ribbon. |
| 4.5–6.5 | Inside the result: it walks off. |
| 6.5–7.9 | Inside the result: a hero packshot that matches the product image. |

**`DgKClheBbPY` (wide)**

| Time | What happens |
|---|---|
| 0.0–7.9 | The static recipe stays on screen. |
| 0.0–3.0 | Inside the result: a knitted penguin wraps a scarf around the serum bottle in a snowy village. |
| 3.0–6.0 | Inside the result: the penguin steps back. |
| 6.0–7.9 | Inside the result: a hero shot of the bottle. |

Every result clip ends on a hero frame of the reference subject, so the "proof" lands as the loop restarts.

## Style spec

- **Canvas:** 1080×1920.
  - Background: a vertical apricot→white gradient (`#F7C29A → #FADBC6 → #FFF9F4`).
  - Grid: faint white lines in 130 px squares, visible only in the middle of the frame.
- **Type:** a geometric bold sans; Poppins is the open-licence match.
  - Headings ("Prompt", "Product", the model name) are 58–76 px bold, black.
- **Prompt card:** a flat grey block (`#5F5F5F`) with white text.
  - Tall layout: 21–27 px semibold, centred.
  - Wide layout: 16–22 px regular, justified.
  - The text fills the card, so long prompts set smaller.
- **Plus signs:** heavy black glyphs (58 px, 14 px stroke) that join the ingredients.
- **Model badge:** in the reference posts, a four-point sparkle with a gradient fill, plus the model name, sitting above the result. The template defaults to the YouMind mark and "YouMind" instead.
- **Motion:** none. The page is completely static; all movement comes from the result clip. The template keeps that default (`motion: "static"`) and offers an optional `pop` entrance.
- **Length:** exactly the result clip's length. The audio is the clip's own soundtrack, or silence.

## Geometry (px, measured from 1080×1920 frames)

| Element | Tall | Wide |
|---|---|---|
| "Prompt" title | 28, 168 · 388×92 | 52, 1062 · 373×80 |
| Prompt card | 28, 271 · 388×689 | 52, 1149 · 373×662 |
| Plus | under the card, y 990 | y 968 (centre) · y 1366 (between card and product) |
| Reference | 27, 1125 · 390×518 | 625, 1197 · 350×526 (white card, `contain`) |
| Reference title | hidden | 625, 1076 · 350×80 ("Product") |
| Model badge | 433, 318 · 620×84 | 52, 232 · 976×90 |
| Result clip | 433, 409 · 620×1101 (9:16) | 52, 337 · 976×550 (16:9) |

## Mapping to `template.json`

| Field | Meaning |
|---|---|
| `result` | The AI-generated clip. Its shape picks the layout when `layout` is `auto`: portrait → tall, landscape → wide. |
| `prompt.text` | The prompt. A blank line starts a new paragraph. |
| `reference.media` / `reference.title` | The input image (or clip). The title only shows in the wide layout, e.g. "Product". |
| `model.name` / `model.icon` | The badge text and icon. They default to "YouMind" and the YouMind mark (`assets/brand/youmind-mark.png`). Use another image path, or `sparkle` for the reference posts' four-point star. |
| `model.colors` | The two gradient colours of the `sparkle` icon. |
| `cta` | An optional comment call to action, e.g. `Comment {skill} to get the Giant Kitten generation prompt in one click`. `{…}` becomes a dark keyword chip.<br>Tall layout: the line sits in the empty band under the recipe (y 1676–1872). Wide layout: above the model badge (y 64–214). Leave it empty to hide it. The reference posts have no CTA on the page; it's added here so viewers know how to ask for the prompt. |
| `audio` | `result` (the clip's own sound), `none`, or a path to a music file. |
| `duration` | `0` for the full clip, or seconds to trim to. |
| `colors` | Background gradient, card, card text and ink. |
| `motion` | `static` (as in the reference posts) or `pop` (a soft staggered entrance). |
