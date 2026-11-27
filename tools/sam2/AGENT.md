# AGENT.md — operating guide for `tools/sam2`

You are using a local tool that turns a talking-head video into a **transparent 9:16 "pop-out" layer**:
the scene sits in a rounded card at the bottom of the canvas and the person's head pops out above it.
Everything else is transparent. Segmentation runs on Apple's Core ML SAM2-small on this Mac.

`README.md` has the full explanation (layout math, model I/O, CLI reference). This file covers how to
run the tool: rules, the standard procedure, and how to map a request to flags.

---

## Ground rules

- **Always run from `tools/sam2` with `.venv/bin/python`.** The venv is already set up. Never
  `pip install` into `~/.venv`; that is the user's main environment.
- **PyPI is extremely slow on this network.** If `.venv` is missing or broken, reinstall from
  `wheels/` if it exists (a local, gitignored cache; see README "Requirements / setup"). Don't wait minutes on a hanging `uv pip install`.
- **`hf` CLI in `~/.venv` is broken** (missing `typer`). The model is already in `models/`; don't re-download it.
- **Never write into the input's folder or overwrite the input.** Always pass a fresh `--out` directory.
- **Test frames first, full render second.** Never start a full render without looking at test images.
- **Run full renders in the background.** The ProRes `.mov` is ~30 MB per second of video; use
  `--preview-only` while iterating.
- **Look at images yourself** (read the JPGs) before telling the user the result is good.

## Standard procedure

```bash
cd tools/sam2
IN=/path/to/input.mp4
OUT=/path/to/output_dir          # new, empty
```

**1. Inspect the input.**
```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,nb_frames,duration -of compact "$IN"
```
Note `nb_frames`; you need it for test indices and for verification.

**2. Test on about 5 frames spread over the video** (indices must be `< nb_frames`):
```bash
.venv/bin/python sam2_person_cutout.py "$IN" --out "$OUT/test" --test-frames 0 125 250 375 500
cd "$OUT/test" && ffmpeg -v error -y $(for f in test_*.jpg; do echo -i $f; done) \
  -filter_complex "hstack=inputs=$(ls test_*.jpg | wc -l),scale=1800:-1" strip.jpg; cd -
```
Then read `strip.jpg`, plus one full-size `test_XXXX.jpg` to check the hair edges. The first run in a fresh venv
spends about 1 min compiling Core ML models.

**3. Check the test images and the log line `layout card: ...`.**
- [ ] The whole person is cut out above the card: hair, shoulders, raised hands. No background blobs.
- [ ] The card is fully filled with scene, with no empty or transparent corners.
- [ ] Head-top position and person size look right for the requested design.
- [ ] `scores=[...]`: the best value is about 0.9 or higher. Lower means the prompt is poor (see fixes).
- [ ] If the log shows `[clamped so the scene fills the card]`, the person placement was overridden so the
      card stays full. Mention it to the user if the result differs from what they asked for.

**4. Fix the result if needed and repeat step 2** (see the tables below).

**5. Run the full render** with the same flags as the accepted test run, in the background:
```bash
.venv/bin/python sam2_person_cutout.py "$IN" --out "$OUT" [flags]
```
Progress shows as `segmented N/total`, then `wrote N/total`, then `done:` with the two paths.
It takes about 0.3 s per frame (a 20 s clip at 25 fps takes about 2.5 min).

**6. Verify before reporting.**
```bash
ffprobe -v error -show_entries stream=codec_name,pix_fmt,width,height,nb_frames -of compact "$OUT"/*_prores4444.mov "$OUT"/*_preview.mp4
ffmpeg -v error -y -ss 5 -i "$OUT"/*_prores4444.mov -frames:v 1 -vf alphaextract,scale=270:-1 "$OUT/alpha_check.png"
```
- [ ] Video `nb_frames` equals the input's (audio is copied, so it may differ by a few ms).
- [ ] `pix_fmt` is `yuva444p…` (has alpha).
- [ ] `alpha_check.png`: white card at the bottom plus the head silhouette, black everywhere else.

**7. Deliver.**
```bash
open -a "QuickTime Player" "$OUT"/*_preview.mp4    # QuickTime shows ProRes alpha as black, so show the preview
open -R "$OUT"/*_prores4444.mov
```
Give the user both absolute paths. The `.mov` is the transparent file for the editor; the `.mp4` is for watching.

---

## Mapping requests to flags

The user often writes in Chinese. Defaults are calibrated to their reference design (1080×1920:
card 500 px tall, 64 px margins, 64 px radius, head top 630 px above the bottom).

| Request | Flag change |
|---|---|
| 人物大一點 / bigger person | raise `--face-height` (default 0.139), e.g. 0.16 |
| 人物小一點 / smaller person | lower `--face-height`, e.g. 0.12 |
| 頭再高一點 / head higher (pops out more) | raise `--head-top` (default 0.328) |
| 頭低一點 / head lower | lower `--head-top` (keep it above `--card-height` or the head won't pop out) |
| 卡片高一點／矮一點 / taller or shorter card | `--card-height` (default 0.2604) |
| 卡片寬一點 / wider card | lower `--card-margin` (default 0.0593; 0 = full width) |
| 圓角大一點 / rounder corners | raise `--card-radius` (default 0.0593) |
| 直接用固定比例 / fixed zoom | `--scale 1.0` (overrides `--face-height`) |
| 其他尺寸畫布 / other canvas size | `--canvas W H` (all layout values are fractions, so they scale) |
| 只保留下半部背景 / keep only the bottom half of the original frame | `--layout half` (optionally `--keep-bottom 0.4` etc.) |
| 邊緣閃爍 / edge flicker | `--smooth 2` |
| Preview on another colour | `--preview-bg "#FFFFFF"` |

**Converting the user's pixel measurements to flags.** On a canvas of height `H` and width `W`:
- `--head-top` = (px from head top to bottom) / H
- `--card-height` = card px / H
- `--card-margin` = margin px / W
- `--card-radius` = radius px / W

## Fixing segmentation problems

Coordinates for `--box`, `--pos` and `--neg` are **source-video pixels**, not canvas pixels. To read
coordinates, extract a frame with a grid where each cell is 100 source px:

```bash
ffmpeg -v error -y -ss 5 -i "$IN" -frames:v 1 -vf "drawgrid=w=100:h=100:color=red@0.5,scale=540:-1" /tmp/grid.jpg
```

| Problem | Fix |
|---|---|
| `no face detected` (side view, tiny face, face covered) | Pass `--box X0 Y0 X1 Y1 --pos x y [x y ...]` manually. Box: head to lap. Points: face, chest. |
| Mask includes the sofa, table or another person | `--neg x y` on that object, and/or a tighter `--box`. |
| Mask misses a hand or hair | `--pos x y` on the missing part, or widen `--box`. |
| Wrong person (several people) | Manual `--box` around the right person, plus `--neg` on the others. |
| Mask fine in some frames, bad in others | Add `--pos`/`--neg` points in areas that stay valid in every frame (the same prompt is used for all frames). |

## Limits (say so instead of forcing it)

- One prompt is used for every frame and there is no SAM2 video memory in the Core ML export. The tool works
  for a **static camera with a person who stays roughly in place**. It is not for walking subjects,
  camera pans or cuts. For multi-shot videos, split the video at the cuts and run each shot separately.
- The layout is computed **once per video** (median face size and median head top). It does not follow the
  head frame by frame; that is intentional, so the background doesn't jitter.
- Hair is a hard mask softened by a guided filter, not true matting. Very fine flyaway hairs can look slightly soft.
- Only runs on macOS on Apple Silicon.

## Log noise you can ignore

`scikit-learn version ... is not supported`, `Torch version ... has not been tested`,
`SyntaxWarning: invalid escape sequence`, and `E5RT encountered an STL exception ... conv_transpose`.
Core ML falls back to another compute unit; the output is correct.

## Reference run (known good)

```bash
.venv/bin/python sam2_person_cutout.py examples/character-talking.mp4 --out examples/output
# face (x y w h): [407, 564, 267, 267]
# layout card: canvas 1080x1920  scale 1.000  offset (-0, 795)  card (64, 1420, 1016, 1920) r=64
#              head top src y=495 -> canvas y=1290 (32.8% of height above bottom)
```
The outputs are in `examples/output/` (509 frames each). If your setup reproduces these numbers, it is healthy.
