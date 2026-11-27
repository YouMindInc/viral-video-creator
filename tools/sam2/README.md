# sam2 — person pop-out video tool (Apple Core ML SAM2)

Turns a talking-head video into a **transparent 9:16 layer**: the scene is kept inside a rounded
"card" at the bottom of the canvas and the person **pops out above the card**. Everything else is
transparent so it can be laid over a title / screenshot / design in any editor.

Segmentation runs locally on Apple Silicon with
[`apple/coreml-sam2-small`](https://huggingface.co/apple/coreml-sam2-small) (Core ML, ANE/GPU).

```
            1080 x 1920 canvas (default)
   y=0    ┌────────────────────────────────┐
          │                                │
          │   transparent                  │   ← put your title / images here
          │                                │
   y≈1290 │            .-~~~-.             │   ← head top: 630 px above bottom (32.8 %)
   y=1420 │  ╭─────────(  °‿° )─────────╮  │   ← card top: 500 px above bottom (26 %)
          │  │  scene + person (opaque) │  │
   y=1920 └──┴──────────────────────────┴──┘
            x=64                     x=1016     ← 64 px side margins, 64 px corner radius
```

There is also a `half` layout (original frame, only the bottom half of the background kept).

---

## TL;DR for agents

```bash
cd tools/sam2
# 1. test 5 frames (fast, ~15 s + one-time Core ML compile) and LOOK at the images
.venv/bin/python sam2_person_cutout.py INPUT.mp4 --out OUT_DIR --test-frames 0 125 250 375 500
# 2. full render (≈0.3 s/frame on this Mac: 509 frames ≈ 2.5 min)
.venv/bin/python sam2_person_cutout.py INPUT.mp4 --out OUT_DIR
# 3. open the preview
open OUT_DIR/INPUT_card_preview.mp4
```

Always do step 1 first and inspect `OUT_DIR/test_XXXX.jpg` (use your image-reading tool) before the
full render. Read the `layout ...` line the script prints (see [Reading the log](#reading-the-log)).

---

## Folder layout

```
tools/sam2/
├── README.md                     this guide
├── sam2_person_cutout.py         the tool (single file, CLI)
├── requirements.txt              pinned deps (Python 3.12, Apple Silicon)
├── .venv/                        ready-to-use virtualenv (uv, Python 3.12)
├── models/coreml-sam2-small/     the 3 Core ML packages (90 MB, from HF apple/coreml-sam2-small)
│   ├── SAM2SmallImageEncoderFLOAT16.mlpackage
│   ├── SAM2SmallPromptEncoderFLOAT16.mlpackage
│   └── SAM2SmallMaskDecoderFLOAT16.mlpackage
├── wheels/                       coremltools wheel (offline install; PyPI is very slow on this network)
└── examples/
    ├── character-talking.mp4                      example input (1080x1920, 25 fps, 20 s, with audio)
    ├── test/test_XXXX.jpg                         output of the --test-frames run
    └── output/
        ├── character-talking_card_preview.mp4     preview on #ECEAE4 (watch this)
        └── character-talking_card_prores4444.mov  the real deliverable, with alpha (~620 MB)
```

## Requirements / setup

- macOS on Apple Silicon (Core ML prediction only works on macOS).
- `ffmpeg` on `PATH` (`brew install ffmpeg`). Already installed here: `/Users/wilson/apps/homebrew-main/bin/ffmpeg`.
- Python 3.12 venv with `coremltools numpy opencv-python-headless pillow`. **`.venv/` is already set up**;
  only recreate it if it is missing/broken:

```bash
cd tools/sam2
uv venv --python 3.12 .venv
# coremltools from the bundled wheel (PyPI downloads are extremely slow on this network)
uv pip install --python .venv/bin/python wheels/coremltools-9.0-cp312-none-macosx_11_0_arm64.whl \
    numpy==2.3.5 opencv-python-headless==4.13.0.92 pillow
# if offline: add --offline (works when the wheels are in ~/.cache/uv)
```

- Model: already in `models/`. To re-download (the `hf` CLI in `~/.venv` is broken — missing `typer` —
  so use the Python API):

```bash
~/.venv/bin/python -c "from huggingface_hub import snapshot_download; \
snapshot_download('apple/coreml-sam2-small', local_dir='models/coreml-sam2-small')"
```

Do **not** `pip install` into `~/.venv` (the user's main env); use `tools/sam2/.venv`.

---

## Step-by-step workflow (for an agent)

### 1. Inspect the input

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,nb_frames,duration \
  -of compact INPUT.mp4
ffmpeg -v error -y -ss 5 -i INPUT.mp4 -frames:v 1 -vf scale=360:-1 /tmp/peek.jpg   # look at it
```

The tool assumes: **one person, static (tripod) camera, person roughly in place** (seated / standing
talking head). Each frame is segmented independently with the *same* prompt — the Core ML export has
no SAM2 video memory — so a person who walks across the frame needs a different approach.

### 2. Test run on a few frames

```bash
.venv/bin/python sam2_person_cutout.py INPUT.mp4 --out OUT --test-frames 0 125 250 375 500
```

Pick indices spread over the video (`nb_frames` from ffprobe). Writes `OUT/test_XXXX.jpg`: the final
canvas composited on the preview colour. Check:

- the whole person (hair, shoulders, hands) is cut out above the card, with no background blobs;
- the card is filled with scene (no empty corners);
- the head top / card positions look like the design.

Helpful: make a strip to view all frames at once:
`ffmpeg -i OUT/test_0000.jpg -i OUT/test_0125.jpg ... -filter_complex "hstack=inputs=N,scale=1800:-1" OUT/strip.jpg`

### 3. Fix problems (then re-run step 2)

| Symptom | Fix |
|---|---|
| `no face detected` | Pass `--box X0 Y0 X1 Y1 --pos x y ...` manually (source pixels, see [Prompting](#prompting-sam2)). |
| Mask grabs sofa / table / another object | Add `--neg x y` on that object, or pass a tighter `--box`. |
| Mask misses part of the person (hand, hair) | Add `--pos x y` on the missing part, or widen `--box`. |
| Person too big / small | `--face-height` (bigger value = bigger person) or a fixed `--scale`. |
| Person too high / low | `--head-top` (fraction of canvas height from head top to bottom). |
| Card too tall / short / wide | `--card-height`, `--card-margin`, `--card-radius`. |
| Edge flicker | `--smooth 2` (temporal window ±2 frames). |
| Log says `[clamped so the scene fills the card]` | Expected when the person-based placement would leave the card partly empty; the background wins. Lower `--head-top` or raise `--face-height` if you dislike the result. |

### 4. Full render

```bash
.venv/bin/python sam2_person_cutout.py INPUT.mp4 --out OUT [same options as the good test run]
```

Run it in the background for long videos; it prints `segmented N/total` then `wrote N/total`.
Add `--preview-only` while iterating to skip the large ProRes file.

### 5. Verify and deliver

```bash
ffprobe -v error -show_entries stream=codec_name,pix_fmt,width,height,nb_frames -of compact OUT/*.mov
# alpha channel check: white = opaque, black = transparent
ffmpeg -v error -y -ss 8 -i OUT/INPUT_card_prores4444.mov -frames:v 1 -vf alphaextract,scale=270:-1 /tmp/alpha.png
open OUT/INPUT_card_preview.mp4     # QuickTime
open -R OUT/INPUT_card_prores4444.mov
```

Frame count of the outputs must equal the input's `nb_frames`.

---

## Outputs

| File | Format | Use |
|---|---|---|
| `<stem>_<layout>_prores4444.mov` | ProRes 4444, `yuva444p10le` (alpha), original audio copied | Import into Final Cut / Premiere / DaVinci / CapCut and place over the design. ~30 MB per second at 1080x1920. |
| `<stem>_<layout>_preview.mp4` | H.264 on `--preview-bg` colour, original audio | Watching / sharing a preview. QuickTime shows ProRes alpha as black, so use this to judge the result. |
| `test_XXXX.jpg` | JPEG (only with `--test-frames`) | Quick visual check. |

---

## How the card layout is computed ("background first, person second")

All numbers below are for the default 1080x1920 canvas; every layout option is a fraction so other
canvas sizes scale proportionally.

1. **Card (fixed, never moves):** `x = 64 … 1016`, `y = 1420 … 1920` (500 px = `--card-height 0.2604`),
   rounded top corners `r = 64`, bleeds off the bottom edge.
2. **Face:** OpenCV Haar frontal-face detector on ~20 frames spread over the video → median box
   `(x, y, w, h)`.
3. **Scale** `s = face_height * canvas_h / face_box_h` (default `--face-height 0.139` = 267 px, which
   reproduces the reference design at 1.0x for the example video). `--scale` overrides it. If no face
   is found: fit the source width to the canvas.
4. **Head top:** for every frame, the first row of the SAM mask that is ≥ 3 low-res pixels wide; the
   **median over all frames** is used, so one high/low frame never moves the layout.
5. **Offset:** the face centre goes to the canvas centre horizontally; the head top goes to
   `canvas_h * (1 - head_top)` = y 1290 (630 px above the bottom, `--head-top 0.328`).
6. **Background-first clamps:** `s` is raised if the scaled frame could not fill the card, and the
   offset is clamped so the scaled frame covers the whole card. The person target is a soft goal; the
   card is a hard rule. The placement is computed once → static for the whole video (no jitter).
7. **Compositing per frame:** canvas alpha = `max(person_alpha, card_mask)`. Inside the card the
   original scene shows; outside it only the person (head/hair pops out; arms outside the card
   edges pop out too).

`--layout half` ignores all of the above: canvas = source size, no scaling, background kept for the
bottom `--keep-bottom` fraction (default 0.5), person kept everywhere.

## Prompting SAM2

By default the prompt is derived from the detected face (`face = x, y, w, h`, centre `cx`):

- box: `cx ± 2w` horizontally, from `y − 0.5h` to `y + 4h` vertically (head + upper body + lap);
- positive points: face centre and chest (`cx, y + 1.6h`).

This suits a seated or standing upper-body talking head. Override with `--box/--pos/--neg` when it
does not. Coordinates are **source video pixels** (not canvas pixels). To pick coordinates, extract a
frame with a grid and read positions off it:

```bash
ffmpeg -v error -y -ss 5 -i INPUT.mp4 -frames:v 1 \
  -vf "drawgrid=w=100:h=100:color=red@0.5,scale=540:-1" /tmp/grid.jpg   # each cell = 100 source px
```

For the example video the manual equivalent would be
`--box 30 460 1050 1590 --pos 570 680 570 990 200 1440 870 1410`.

## CLI reference

```
sam2_person_cutout.py VIDEO --out DIR [options]

  --models DIR          folder with the 3 SAM2Small*.mlpackage (default: ./models/coreml-sam2-small)
prompt (default: derived from the detected face)
  --box X0 Y0 X1 Y1     box around the person, source pixels
  --pos x y [x y ...]   positive points
  --neg x y [x y ...]   negative points
layout
  --layout card|half    default card
  --canvas W H          default 1080 1920
  --card-height F       card height / canvas height            (default 500/1920 = 0.2604)
  --card-margin F       card side margin / canvas width        (default 64/1080 = 0.0593)
  --card-radius F       card corner radius / canvas width      (default 64/1080 = 0.0593)
  --head-top F          head top → canvas bottom / canvas height (default 630/1920 = 0.328)
  --face-height F       target face-box height / canvas height  (default 267/1920 = 0.139)
  --scale S             fixed source→canvas scale (overrides --face-height)
  --keep-bottom F       half layout only: kept background fraction from the bottom (default 0.5)
output
  --smooth K            temporal mask smoothing, ±K frames (default 1, 0 = off)
  --test-frames I ...   only process these frame indices, write test_XXXX.jpg
  --preview-only        skip the ProRes 4444 .mov
  --preview-bg HEX      preview background colour (default #ECEAE4)
```

## Reading the log

```
509 frames 1080x1920 @ 25.0fps
face (x y w h): [407, 564, 267, 267]
prompt box: [6, 430, 1074, 1632] pos: [(540, 697), (540, 991)]
segmented 1/509  scores=[0.933, 0.965, 0.673]      ← SAM's 3 candidate masks; the best is used (≈0.96 is good)
layout card: canvas 1080x1920  scale 1.000  offset (-0, 795)  card (64, 1420, 1016, 1920) r=64
             head top src y=495 -> canvas y=1290 (32.8% of height above bottom)
wrote 1/509 ...
done:
  .../character-talking_card_prores4444.mov
  .../character-talking_card_preview.mp4
```

Harmless noise you can ignore: `scikit-learn version ... not supported`, `Torch version ... has not
been tested`, `SyntaxWarning: invalid escape sequence`, and
`E5RT encountered an STL exception ... conv_transpose` (Core ML falls back to another compute unit).
The first run in a new venv spends ~1 min compiling the models; later runs start in seconds.

## Model notes (if you need to call it directly)

| Package | Inputs | Outputs |
|---|---|---|
| ImageEncoder | `image`: RGB image 1024x1024 (stretch-resize the frame, no padding; normalisation is inside the model) | `image_embedding` [1,256,64,64], `feats_s0` [1,32,256,256], `feats_s1` [1,64,128,128] |
| PromptEncoder | `points` [1,N,2] float32 in 1024x1024 space, `labels` [1,N] int32 | `sparse_embeddings` [1,N,256], `dense_embeddings` [1,256,64,64] |
| MaskDecoder | `image_embedding`, `sparse_embedding`, `dense_embedding`, `feats_s0`, `feats_s1` | `low_res_masks` [1,3,256,256] logits, `scores` [1,3] |

Labels: `1` positive point, `0` negative point, `2`/`3` box top-left / bottom-right, `-1` padding
("not a point"; add a `(0,0)` point with label `-1` when you send points without a box).
Mask logits > 0 = foreground; the 256x256 grid maps to the whole frame (stretched), so resize it
straight to `(width, height)`. Load with `coremltools.models.MLModel(path, compute_units=ComputeUnit.ALL)`.

## Example

Input `examples/character-talking.mp4` (1080x1920, 25 fps, 509 frames, 20.4 s), default options:

```bash
.venv/bin/python sam2_person_cutout.py examples/character-talking.mp4 --out examples/output
```

Result: `examples/output/character-talking_card_preview.mp4` (watch) and
`examples/output/character-talking_card_prores4444.mov` (alpha). Scale 1.0, head top at y≈1290,
card at y 1420–1920 — matching the reference design (title + screenshot on top, person popping out
of the bottom card).
