# AGENT.md — operating guide for `viral-video-creator`

The repo has six templates. Pick one from the user's material, or ask once if it's unclear.
- **editorial-explainer:** sections 1–4 below.
- **prompt-recipe:** an AI result shown as a recipe card. See "Prompt Recipe" near the end.
- **prompt-recipe-advanced:** the same poster, then a YouMind end card with a spoken comment line. See "Prompt Recipe Advanced" near the end.
- **quickcut-tutorial:** a talking-head tutorial with fast cutaways. See "Quick-Cut Tutorial" near the end.
- **swap-list:** a faceless countdown of paid apps and their free swaps, made from text only. See "Swap List" near the end.
- **feature-drop:** a faceless "BREAKING: X just killed Y" product tour with numbered feature panels, made from a script and screenshots. See "Feature Drop" near the end.

The editorial-explainer template turns two videos and a few lines of text into a finished 1080×1920 short:
**top** = product / share-content video, **middle** = headline and subtitles, **bottom** = a talking person,
cut out with SAM2 so their head pops out of a rounded scene card. Rendering is HyperFrames (headless Chrome).

**The user only provides material. You do everything else**: setup, importing, subtitles, cutout, layout,
checks and rendering. **Show them a preview before the final render.** The user never runs a command, types
into a terminal, or edits a file.

`README.md` is the human guide (in Chinese); `tools/sam2/AGENT.md` covers the SAM2 tool in depth.

---

## The flow

1. **Ask for material.** Send the checklist in section 1, once. Follow up only if a *required* item is missing.
2. **Build a preview, without asking anything** (section 2). The user gets still frames of the layout, the
   cutout samples and a live player link. This takes a few minutes.
3. **The user replies "OK" or says what to change** in plain words. Apply the changes, refresh the preview,
   and repeat (section 3).
4. **Render the final MP4 and hand it over** (section 4).

## Ground rules

- **Run everything from the repo root.** Give file paths as absolute paths.
- **Run heavy steps outside the sandbox.** If your harness sandboxes commands, run SAM2,
  `hyperframes snapshot/preview/check/render` and `setup` outside it. Sandboxed, they fail in ways that look
  like bugs:
  - Core ML `Failed to create a working directory`;
  - Chrome `SIGABRT` / `Target closed`;
  - `EPERM` on `~/.cache/hyperframes`;
  - a port that won't open.
- **Fill gaps with the defaults in section 1** instead of asking. Tell the user what you chose when you
  show the preview.
- **Check the preview and the final video yourself first**, then show them. Fix what you can see is wrong
  (clipped headline, bad cutout) before the user sees it.
- **Run long steps in the background:** the full SAM2 pass and the render.
- **Only one generator at a time** (lock file: `templates/editorial-explainer/.cache/generate.lock`).
- **Production content never goes into git.** See "Git hygiene".

## 1. Ask for material

Send this in the user's language. The Chinese version matches the README.

> 請提供以下素材，其餘都由我處理，完成後會先給你預覽：
>
> **必備**
> 1. **人物影片**：一個人面對鏡頭說話。
>    - 鏡頭固定，臉清楚可見，有收音。
>    - 直式最佳。
>    - 影片多長，成片就多長。
> 2. **上方內容影片**：產品示範、螢幕錄影或動畫。
>    - 橫式最佳，約 960×660 的比例。
>    - 這支影片的聲音不會使用。
>
> **可選**（沒提供我會先幫你填，預覽時可以再改）
> 3. **品牌名稱**。
> 4. **標題**：1–2 行，每行約 12 個中文字或 24 個英文字母。
> 5. **短標籤**：例如「ANIMATION TOOLKIT」。
> 6. **字幕檔 `.srt`**：沒有的話我會自動辨識語音產生字幕。
> 7. **人物樣式**：去背凸出圓角框（預設），或原片裁切。
>
> 檔案可以直接拖進對話框，或告訴我放在哪個資料夾。

> Please send the material below. I'll handle everything else and show you a preview before the final video.
>
> **Required**
> 1. **Person video:** one person talking to the camera.
>    - Steady camera, face clearly visible, with sound.
>    - Portrait is best.
>    - The final video is as long as this clip.
> 2. **Top video:** a product demo, screen recording or animation.
>    - Landscape is best, about 960×660.
>    - Its sound is not used.
>
> **Optional** (I'll fill these in and you can change them at the preview)
> 3. **Brand name.**
> 4. **Headline:** 1–2 lines, about 24 Latin letters (12 CJK characters) per line.
> 5. **Short label**, e.g. "ANIMATION TOOLKIT".
> 6. **Subtitles (`.srt`).** Otherwise I'll transcribe the speech automatically.
> 7. **Person style:** cut-out popping out of a rounded card (default), or a plain crop.
>
> Drag the files into the chat, or tell me which folder they're in.

**What the material must be, and why:**

| Item | Requirement | Why |
|---|---|---|
| Person video | `.mp4` / `.mov` / `.m4v` / `.webm`. One person, steady camera, roughly in place, face visible (not side-on), with audio. The sample is 1080×1920 at 25 fps. | SAM2 uses one prompt for every frame and finds the person by their face. The final length and audio come from this file. |
| Top video | Same formats. Any length. | It is fitted inside a 960×660 box ("contain"), so other shapes get margins. If it's shorter than the person video it holds its last frame; if longer, it's cut. It plays muted. |
| Text | Brand and label ≤ 300 characters; headline ≤ 2 lines. | Longer headline lines get clipped at the default 80 px size. |
| Subtitles | `.srt` under 2 MB, timed within the person video, no overlapping cues. | The generator rejects anything else. |

**Defaults for anything missing.** Don't ask; mention them in the preview message.

| Missing | Use |
|---|---|
| Which file is which | Look at a frame of each. The one with a face and speech is the person video. |
| Brand | Keep the current `brand` in `template.json`, unless it is the sample's `YOUR BRAND`; then clear it (`-`). |
| Headline / label | Write them from the transcript (or the user's request), within the limits above. |
| Subtitles | `auto` if the person video has audio and `whisper-cli` is installed; otherwise `none`. |
| Style | `sam2` |

The user's own words in the request are material too. "標題寫『…』" sets the headline.

## 2. Build the preview

**2.0 Preflight** (once per session):
```bash
pnpm setup:editorial-explainer --check
```
If anything shows `MISSING`, run it again without `--check`; it installs only what is missing. On a fresh clone,
run `pnpm install --frozen-lockfile` first. Homebrew on this Mac is in `~/apps/homebrew-main/bin`; put it on
`PATH` if `ffmpeg` isn't found.

**2.1 Check the files.**
```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration -of compact "/abs/person.mp4"
```
Confirm both are video files, the person video has an audio stream, and which one is the person (see the
defaults above). If the person video breaks the requirements (several people, moving camera), tell the user
now, before you build anything.

**2.2 Import and build** (no SAM2, no render). The generator asks 8 questions on stdin. Pipe the answers in
this order, one per line. An empty line keeps the current value; `-` clears a text field.

| # | Question | Answer |
|---|---|---|
| 1 | person video | absolute path |
| 2 | top video | absolute path |
| 3 | brand | text or `-` |
| 4 | headline line 1 | text |
| 5 | headline line 2 | text, or `-` for none |
| 6 | content label | text or `-` |
| 7 | subtitles | absolute `.srt` path, `auto`, `none`, or `keep` (only if the person video is unchanged) |
| 8 | person style | `sam2` or `original` |

```bash
printf '%s\n' "/abs/person.mp4" "/abs/top.mp4" "TIAN EXPLAINS" "From one multiplication" "to ChatGPT." \
  "ONE OPERATION / MANY LAYERS" auto sam2 \
  | pnpm -s generate:editorial-explainer --prepare-only --no-open
```

- **Success** ends with `素材與模板已準備好` and exits 0. Note the folder printed after `本次輸出資料夾：`;
  it is this job's `$RUN` folder.
- **A rejected answer** prints the reason and asks again. That question then eats the next piped line, so the
  run ends with `輸入已結束，已停止。`. Read the message above it, fix that answer, and rerun.

**2.3 Make the preview.**
At this point the person still shows as a plain crop, because the cutout comes in 2.4.
```bash
RUN=/abs/path/printed/by/step/2.2
mkdir -p "$RUN/preview"
DUR=$(node -p "require('./templates/editorial-explainer/analysis/hyperframes-build.json').duration")
# still frames (about 5 s); starts at 1 s because the intro animation makes t=0 blank
node_modules/.bin/hyperframes snapshot templates/editorial-explainer --range 1,$DUR --frames 4 -o "$RUN/preview/frames"
# live player with audio; it reloads by itself whenever the template is rebuilt
node_modules/.bin/hyperframes preview templates/editorial-explainer --port 3017 --background --no-open
```
`$RUN/preview/frames/contact-sheet.jpg` shows the layout. The live player is at
http://localhost:3017/#project/editorial-explainer.

**2.4 Cutout samples** (style `sam2` only; skip if a layer already exists for this person and card).
```bash
pnpm sam2:test            # the first Core ML load takes about a minute
IMGS=($(node -p "require('./templates/editorial-explainer/assets/persona/sam2-tests.json').images.map(f => 'templates/editorial-explainer/' + f).join(' ')"))
ffmpeg -v error -y $(printf -- '-i %s ' "${IMGS[@]}") -filter_complex "hstack=inputs=${#IMGS[@]},scale=1800:-1" "$RUN/preview/cutout-samples.jpg"
```

**2.5 Check it yourself.** Read `contact-sheet.jpg` and `cutout-samples.jpg`.
- *Layout:* the headline isn't clipped, subtitles sit in their band, and the top video is the right one and
  readable.
- *Cutout:* the whole person is cut out (hair, shoulders, hands), there are no background blobs, and the card
  is fully filled. Use `tools/sam2/AGENT.md` step 3.
- *If something is wrong,* fix it (section 3, or "Manual SAM2") and regenerate before showing the user.

**2.6 Start the full cutout now,** in the background, without waiting for the user:
```bash
pnpm sam2:prepare         # about 0.3 s per frame plus a WebM conversion; ends with "Persona: sam2."
```
When it finishes, the live player switches to the cutout by itself. If the user then changes only text,
layout or colours, the layer is still valid.

**2.7 Show the preview.** On macOS, run `open "$RUN/preview/frames/contact-sheet.jpg" "$RUN/preview/cutout-samples.jpg"`. Then send:
- the two image paths and the live link;
- a note that the person shows as a plain crop until the cutout finishes in the background;
- each default you filled in (brand, headline, label, subtitles, style);
- *"Reply OK to render the final video, or tell me what to change."*

## 3. Apply feedback

Map the user's words to edits in `templates/editorial-explainer/template.json`. Then rebuild, take new
stills, and show them again. The live player reloads by itself.
```bash
pnpm build:editorial-explainer
node_modules/.bin/hyperframes snapshot templates/editorial-explainer --range 1,$DUR --frames 4 -o "$RUN/preview/frames"
```
If `sam2:prepare` is still running, wait for it before you rebuild: it rebuilds at the end with the settings it
started with.

| Request | Edit |
|---|---|
| Text: 標題, 品牌, 標籤 | `headline` (array, ≤ 2 lines), `brand`, `visual.label` |
| Move or resize: 位置, 大小, 字級 | `layout.<brand\|headline\|visual\|label\|captions\|persona>` `{x, y, width, height, fontSize}` |
| Colours: 背景色, 字色, 強調色 | `background`, `ink`, `accent` as `#RRGGBB` |
| No cutout: 不要去背 / 原片 | `persona.mode` → `"original"`; `persona.cropY` moves the crop |
| Card shape: 卡片高度, 邊距, 圓角 | `persona.sceneTop` (0–500), `sceneInset` (0–400), `cornerRadius` (0–250). This invalidates the cutout, so redo 2.4 and 2.6. |
| Person bigger or smaller, head higher | Not exposed by the bridge. Use "Manual SAM2" with `--face-height` / `--head-top`. |
| A different video or subtitle file | Redo 2.2 with that answer changed and empty lines elsewhere. A new person video also means redoing 2.4 and 2.6. |

Limits that `template.json` enforces:
- the canvas is 1080×1920 and every box must fit inside it;
- `fontSize` is 16–160;
- at most 2 headline lines, ≤ 100 characters each, and other text ≤ 300;
- media paths are relative and inside `templates/editorial-explainer/`.

Bring in new files only through step 2.2.

## 4. Render and deliver

Once the user says OK (and `sam2:prepare` has finished, for style `sam2`), render in the background:
```bash
pnpm generate:editorial-explainer --current --no-open          # --quality high if they asked for best quality
```
A 15 s clip takes about a minute. Watch the newest `renders/editorial-explainer/*/job.json` until `status` is
`done`. If it is `failed`, read `failedStage` and `error`, and see Troubleshooting. The generator already checks
1080×1920, the length and the audio.

Then look at it before handing it over:
```bash
JOB="$(ls -td "$PWD"/renders/editorial-explainer/*/ | head -1)job.json"
OUT=$(node -p "require('$JOB').output"); DUR=$(node -p "require('$JOB').duration")
ffmpeg -v error -y -i "$OUT" -vf "fps=5/$DUR,scale=216:-1,tile=5x1" -frames:v 1 "${OUT%/*}/contact-sheet.jpg"
```
Read the contact sheet, then:
1. `open "$OUT"`;
2. give the user the absolute path, the duration and the contact sheet;
3. stop the live player with `node_modules/.bin/hyperframes preview templates/editorial-explainer --stop`.

## Prompt Recipe (`templates/prompt-recipe`)

A static poster: prompt card + reference image → model name → the AI result video playing. The style and
geometry are in `templates/prompt-recipe/BREAKDOWN.md`.

**Ask for:**
1. the AI-generated video;
2. the prompt text;
3. one reference image (product or person);
4. the model or tool name;
5. optionally, a comment keyword for the call-to-action line (`cta`, e.g. `Comment {skill} to get the … prompt in one click`).

Nothing else is needed. The video's shape picks the layout: portrait → tall, landscape → wide. The length and
sound come from the video.

**Build it:**
1. Copy the files into `templates/prompt-recipe/assets/inputs/`.
2. Edit `templates/prompt-recipe/template.json`: `result`, `prompt.text`, `reference.media` (and
   `reference.title` for wide, e.g. "Product"), and `cta`. The badge defaults to YouMind; change `model.name`
   and `model.icon` only for another tool.
3. Run `pnpm build:prompt-recipe`.

**Preview:** run `node_modules/.bin/hyperframes snapshot templates/prompt-recipe --at 2 --no-end -o "$RUN"`.
For the live player, run `node_modules/.bin/hyperframes preview templates/prompt-recipe --port 3019 --background --no-open`.

**Final:** `pnpm render:prompt-recipe` writes `templates/prompt-recipe/renders/prompt-recipe.mp4`.

## Prompt Recipe Advanced (`templates/prompt-recipe-advanced`)

Use it when the user wants the video to end with a spoken call to action. It is Prompt Recipe plus three things:
- **End card:** after the result clip, a big YouMind app icon, the name and the comment line, with the keyword chip pulsing as it's spoken.
- **Voice line:** spoken over the end card.
- **Reference corners:** rounded to 5 px.

**Ask for:** the same material as Prompt Recipe, plus the comment keyword and the sentence to speak. Use the
user's own recording if they have one (`voice.file`); otherwise `voice.text` is synthesised offline with macOS `say`
(`voice.speaker`: `Samantha` by default; `Daniel`, `Karen`, `Flo (English (US))`…).

**Build it:**
1. Set the same fields as Prompt Recipe in `templates/prompt-recipe-advanced/template.json`, plus `cta`,
   `voice.text` and (optionally) `endCard.text`.
2. Run `pnpm build:prompt-recipe-advanced`. It prints the clip length, the end-card length and when the voice starts.

The end card lasts at least 2.8 s and stretches to fit the voice.

**Preview:** take stills mid-clip and about 1.5 s after the clip ends, and use the live player on `--port 3021`. Check that the
end card fades in from the clip's last frame and the comment line fits.

**Final:** `pnpm render:prompt-recipe-advanced`. Check the audio: the voice should be the loudest part of the last few seconds.

## Quick-Cut Tutorial (`templates/quickcut-tutorial`)

A talking-head tutorial with cutaways, word-by-word captions and a "COMMENT 'KEYWORD'" ending. The scene types,
their geometry and the reference timings are in `templates/quickcut-tutorial/BREAKDOWN.md`.

**Ask for:**
1. the talking-head video (required);
2. every screen recording, AI result or B-roll clip they want shown (required);
3. the comment keyword;
4. optionally, their avatar, display name, handle and a one-line bio for the profile card.

**Build it (no user input):**
1. Copy the files into `templates/quickcut-tutorial/assets/inputs/`.
2. Run `pnpm transcribe:quickcut-tutorial assets/inputs/<talk>.mp4` to write the word-level `<talk>.words.srt`.
   Set `aroll` and `captions` to those files.
3. **Plan `scenes` from the transcript yourself.** Look at a frame of every media file first.

   | Speech | Scene |
   |---|---|
   | The hook (first ~2 s) | `inset` over the most impressive result, or leave it as `face` with kinetic captions |
   | "go to / open / type / paste / click / upload" | `split` (desktop recording) or `phone` (phone recording) |
   | "to get this / like this / watch / here's the result" | `broll` (landscape or full-frame result) or `card` (vertical result on blur) |
   | "you don't need… / anyone can…" over supporting footage | `bubble` |
   | Lists, audiences, numbers, prices | `title` with 1–3 coloured `lines`; set each `at` to the word's time |
   | "comment X and I'll send you…" | `cta` with `keyword: X`, running to the end |

   - Leave gaps for plain `face` shots between cutaways; the build alternates punch-ins automatically.
   - Keep each scene 1.5–4 s, and cut on word boundaries from the SRT.
   - Use `transition: "flash"` at most two or three times.
4. Run `pnpm build:quickcut-tutorial`. It prints the segment order and the caption count.

**Preview:** take one still per scene with `node_modules/.bin/hyperframes snapshot templates/quickcut-tutorial --at <mid-point of each scene, comma-separated> --no-end -o "$RUN"`.
The live player is `--port 3020`. Read the contact sheet and check:
- captions don't cover faces or UI text;
- titles fit;
- the right media is in each slot.

Then show the user.

**Final:** `pnpm render:quickcut-tutorial` (a 20 s video renders in about 30 s).

## Swap List (`templates/swap-list`)

A faceless countdown: "Stop paying for N apps", one swap card per app, chapter cards, and a "which one would you swap first?" ending. It needs no footage:
- the voice-over is macOS text-to-speech, one line at a time;
- captions, card animations, sound effects and the mascot's expressions are timed from those lines.

The layout per scene is in `templates/swap-list/BREAKDOWN.md`.

**Ask for:**
1. the apps (2–12): paid name → free name, the GitHub URL, and up to 4 features each, grouped into 1–4 chapters (required);
2. the voice language. Write the lines yourself from the list unless the user gives a script;
3. optionally: the app they'd swap first, the save-button text, a sample comment, their own avatar PNG, app icons, a voice recording per line, and music.

**Build it (no user input):**
1. Write `templates/swap-list/template.json`.
   - **Each app's `say`** has three lines: the paid name ("{Loom}."), the swap ("Swap it for {Cap}."), and one line covering its features.
   - **Pronunciation:** put `{ "text": "...", "speak": "..." }` on anything TTS would mispronounce (e.g. "Cal dot com").
   - **Free-app icons:** for `glyph`, pick from screen, image, mic, doc, tasks, calendar, chat, video, pen, bolt, wave, chart, code, globe, mail, lock.
   - **Chinese:** `voice.speaker: "Meijia"`.
2. Run `pnpm build:swap-list`. It prints the length, scene count and line count. The first build synthesises every line, which takes about 20 s; later builds use the cache.

**Preview:**
- **Stills:** take one per scene, near its end, so the stamp has landed: `node_modules/.bin/hyperframes snapshot templates/swap-list --at <times> --no-end -o "$RUN"`.
- **Live player:** `--port 3022`.
- **Check that:**
  - names fit;
  - captions sit above the mascot;
  - the outro bubble stays on screen.

**Final:** `pnpm render:swap-list`.

## Feature Drop (`templates/feature-drop`)

A faceless product tour in a dark ember style. It is built from an ordered list of `scenes`:

| Scene | What it shows |
| --- | --- |
| `hook` | X just killed Y |
| `reveal` | screenshot + stats |
| `count` | FREE stamp + number + chips |
| `feature` | auto-numbered; one panel each |
| `teaser` | "but the best part…" |
| `rank` | proof rows |
| `steps` | setup in N steps, with a terminal |
| `cta` | comment keyword |

Each `feature` uses one panel:
- `media`: a screenshot or video;
- `list`;
- `timeline`: a cut list;
- `board`: a kanban;
- `week`: a weekly planner;
- `terminal`.

Panel fields are in `templates/feature-drop/README.md`; the source analysis is in `BREAKDOWN.md`.

**Ask for:**
1. what the product or tool is, and the claim for the hook (required);
2. its features: for each, a short title, a command or tag, and what it does (required);
3. screenshots or screen recordings, if they have them;
4. setup steps;
5. the comment keyword (required).

**Build it (no user input):**
1. Write the script into `scenes`, one to three spoken lines per scene.
2. Pick a panel per feature:

   | The feature… | Panel |
   | --- | --- |
   | is visual, or you have a screenshot | `media` |
   | ranks or picks from options | `list` with `highlight` |
   | edits or schedules in time | `timeline` |
   | sorts messages or tasks | `board` |
   | plans days | `week` |
   | runs as a command | `terminal` |

3. Never invent numbers for `rank` or `stats`. Ask, or use words instead of figures.
4. Run `pnpm build:feature-drop`.

**Preview:**
- **Stills:** take one per scene, about 0.15 s before each scene ends. The build's `metadata.scenes` has the times.
- **Live player:** `--port 3023`.
- **Check that:**
  - titles and panel rows fit;
  - videos sit inside their panel.

**Final:** `pnpm render:feature-drop`.

## Manual SAM2 (face not detected, wrong mask, person size)

`sam2:test` / `sam2:prepare` can't pass `--box` / `--pos` / `--neg` / `--face-height`. Run the tool directly
with the same card flags the bridge uses, then import the result:
```bash
T="$PWD/templates/editorial-explainer"
SRC="$T/$(node -p "require('$T/template.json').persona.source")"
OUT="$T/.cache/sam2/manual-$(date +%s)"
FLAGS=$(node -p "const p=require('$T/template.json').persona; ['--card-height',(640-p.sceneTop)/1920,'--card-margin',p.sceneInset/1080,'--card-radius',p.cornerRadius/1080,'--head-top',630/1920,'--smooth',2].join(' ')")
cd tools/sam2
.venv/bin/python sam2_person_cutout.py "$SRC" --out "$OUT/test" $FLAGS --test-frames 0 120 240 --box X0 Y0 X1 Y1 --pos x y
# read $OUT/test/test_*.jpg, adjust, repeat; then the full run with identical flags (background):
.venv/bin/python sam2_person_cutout.py "$SRC" --out "$OUT" $FLAGS --box X0 Y0 X1 Y1 --pos x y
cd ../..
node templates/editorial-explainer/scripts/sam2-bridge.mjs import "$OUT/$(basename "${SRC%.*}")_card_prores4444.mov"
```
Box and point coordinates are in source-video pixels. `tools/sam2/AGENT.md` covers reading them off a grid
frame and the fix for each mask problem. Test frame indices must be below the frame count. The import rebuilds
the template. The ProRes file is about 30 MB per second; `pnpm clean:editorial-explainer` removes it.

## Troubleshooting

| Message (in output or `job.json`) | Cause | Fix |
|---|---|---|
| `Failed to create a working directory`, Chrome `SIGABRT`, `Target closed`, `EPERM … .cache/hyperframes` | Sandbox | Rerun the same command unsandboxed. |
| `no face detected: pass --box (and --pos) manually` | Side view, small or covered face | Manual SAM2. |
| `目前人物尚無 SAM2 圖層` | `--current` before the cutout exists | Finish 2.4 and 2.6 first. |
| `另一個產生器仍在執行` | A generator is running | Wait for it. A lock left by a dead process is removed automatically. |
| `找不到 SAM2 環境` / `缺少 SAM2 模型` | SAM2 not set up | `pnpm setup:sam2` |
| `找不到 whisper-cli 或本機模型` | Whisper missing | Use `none` and tell the user. Run `pnpm setup:editorial-explainer --with-whisper` (1.6 GB) only if they want auto subtitles. |
| `輸入已結束，已停止。` | A piped answer was rejected | Read the error above it; fix that line. |
| `輸出影片的尺寸、長度或音軌與設定不同` | The render doesn't match the settings | Read `render.log` in the run folder. |
| `SAM2 處理未完成` | The SAM2 script failed | The traceback is above it; see `tools/sam2/AGENT.md` ("Log noise" lists the warnings you can ignore). |

## Where things are

| Path | What it is |
|---|---|
| `templates/editorial-explainer/template.json` | Active settings: media, text, colours, layout. Rewritten on every run. |
| `templates/editorial-explainer/scripts/news-channel.html` | Layout source. `index.html` is built from it; never edit `index.html`. |
| `templates/editorial-explainer/assets/inputs/` | Imported footage and SRTs (content-hashed names, gitignored). |
| `templates/editorial-explainer/assets/persona/` | Cutout layers (`sam2-<hash>.webm`), `prepared.json`, `sam2-tests/`. |
| `renders/editorial-explainer/<timestamp>-<id>/` | One folder per run: `job.json`, `render.log`, `template.json`, `preview/`, and `video.mp4` for a final render. Gitignored. |
| `tools/sam2/` | SAM2 Core ML person cutout. |
| `scripts/setup.mjs` | Installs and checks every dependency. |

## Cleaning up

```bash
pnpm clean:editorial-explainer --dry-run       # always look first
pnpm clean:editorial-explainer                 # SAM2 work dirs, preview caches, check snapshots, partial files
```

- `--renders` deletes every run folder, including the users' finished MP4s. Use it only when asked.
- `--prepared` deletes every cutout, **including the tracked sample** (`index.html`,
  `analysis/hyperframes-build.json`, `assets/persona/*`). If you run it, afterwards run
  `git restore templates/editorial-explainer/index.html templates/editorial-explainer/analysis templates/editorial-explainer/assets/persona`.

Files that `template.json` points to are always kept.

## Git hygiene

`.gitignore` already keeps out these production files: `renders/`, `assets/inputs/`, the preview caches, and
every `sam2-<hash>.webm` / `sam2-tests/<hash>/` except the sample's `88e005db878635b4`. Never bypass it with `git add -f`.

These **tracked** files are rewritten by every job and will show up as changed:
```
templates/editorial-explainer/template.json
templates/editorial-explainer/index.html
templates/editorial-explainer/analysis/hyperframes-build.json
templates/editorial-explainer/assets/persona/prepared.json
templates/editorial-explainer/assets/persona/sam2-tests.json
```

- **Don't commit them with production values** (a real brand, `assets/inputs/…` paths). A clone can't
  resolve those paths, so it would break. Leave them out of commits, or `git restore` them to go back to
  the sample.
- **Restoring has a cost:** a later rerun of that production person repeats SAM2.
- **Commit them only for an intentional change to the sample** or to the layout source.

## Verifying code changes

```bash
pnpm verify                      # workspace, build, unit tests, HyperFrames lint, model checksums, SAM2 venv
pnpm check:editorial-explainer   # browser layout/motion check (unsandboxed)
```
`pnpm verify` rebuilds `index.html` from the current `template.json`. Run it with the sample settings before
committing.
