"""SAM2 (Apple Core ML) person pop-out tool for talking-head videos.

Segments the person in every frame with Apple's Core ML SAM2-small, then composes a
transparent layer:

  card layout (default)  a 9:16 canvas where the scene is kept inside a rounded "card" at the
                         bottom and the person pops out above it (at 1080x1920: card 500px tall
                         with 64px side margins, head top ~630px above the bottom edge).
  half layout            the original frame with only the bottom part of the background kept.

Background first: the card never moves. The person only decides one static scale + offset for
the whole video (median face size and median head top), clamped so the scene always fills the
card, so nothing jitters when the head moves. Writes a ProRes 4444 .mov with alpha plus an .mp4
preview. See README.md for the full workflow.
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

import coremltools as ct
import cv2
import numpy as np
from PIL import Image

SAM_SIZE = 1024
LR = 256  # side of SAM's low-res mask logits
DEFAULT_MODELS = Path(__file__).resolve().parent / "models" / "coreml-sam2-small"
FACE_CASCADE = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"


# ---------------------------------------------------------------- SAM2 (Core ML)

COMPUTE_UNITS = {
    "all": ct.ComputeUnit.ALL,
    "cpu-and-gpu": ct.ComputeUnit.CPU_AND_GPU,
    "cpu-only": ct.ComputeUnit.CPU_ONLY,
    "cpu-and-ne": ct.ComputeUnit.CPU_AND_NE,
}


def load_models(model_dir: Path, compute_unit):
    def load(name):
        return ct.models.MLModel(str(model_dir / f"SAM2Small{name}FLOAT16.mlpackage"),
                                 compute_units=compute_unit)
    return load("ImageEncoder"), load("PromptEncoder"), load("MaskDecoder")


def encode_prompt(prompt_encoder, box, pos_points, neg_points, w, h):
    """Box -> labels 2/3, positive points -> 1, negative -> 0. Coordinates in SAM's 1024 space."""
    sx, sy = SAM_SIZE / w, SAM_SIZE / h
    pts, labels = [], []
    if box is not None:
        x0, y0, x1, y1 = box
        pts += [[x0 * sx, y0 * sy], [x1 * sx, y1 * sy]]
        labels += [2, 3]
    for x, y in pos_points:
        pts.append([x * sx, y * sy]); labels.append(1)
    for x, y in neg_points:
        pts.append([x * sx, y * sy]); labels.append(0)
    out = prompt_encoder.predict({
        "points": np.array([pts], dtype=np.float32),
        "labels": np.array([labels], dtype=np.int32),
    })
    return out["sparse_embeddings"], out["dense_embeddings"]


def segment_frame(encoder, decoder, rgb, sparse, dense):
    img = Image.fromarray(rgb).resize((SAM_SIZE, SAM_SIZE), Image.BILINEAR)
    feats = encoder.predict({"image": img})
    out = decoder.predict({
        "image_embedding": feats["image_embedding"],
        "sparse_embedding": sparse,
        "dense_embedding": dense,
        "feats_s0": feats["feats_s0"],
        "feats_s1": feats["feats_s1"],
    })
    masks = np.asarray(out["low_res_masks"], dtype=np.float32)[0]  # (3, 256, 256) logits
    scores = np.asarray(out["scores"], dtype=np.float32).reshape(-1)
    return masks, scores


# ---------------------------------------------------------------- person / face measurements

def detect_face(frames, samples=20):
    """Median (x, y, w, h) of the largest frontal face over ~`samples` frames, or None."""
    casc = cv2.CascadeClassifier(FACE_CASCADE)
    boxes = []
    for rgb in frames[::max(1, len(frames) // samples)]:
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        faces = casc.detectMultiScale(gray, 1.1, 5, minSize=(gray.shape[1] // 10,) * 2)
        if len(faces):
            boxes.append(max(faces, key=lambda b: b[2] * b[3]))
    return np.median(np.array(boxes, np.float32), axis=0) if boxes else None


def auto_prompt(face, w, h):
    """Box + positive points for a seated / upper-body talking head, derived from the face box."""
    x, y, fw, fh = face
    cx = x + fw / 2
    box = [max(0, cx - 2 * fw), max(0, y - 0.5 * fh), min(w - 1, cx + 2 * fw), min(h - 1, y + 4 * fh)]
    pos = [(cx, y + fh / 2), (cx, min(h - 1, y + 1.6 * fh))]
    return box, pos


def head_top(logits, h):
    """Median over frames of the first mask row (source pixels) that is at least 3 low-res px wide."""
    tops = []
    for m in logits:
        rows = np.nonzero((m > 0).sum(axis=1) >= 3)[0]
        if len(rows):
            tops.append(rows[0] * h / LR)
    return float(np.median(tops))


def guided_filter(guide, src, radius, eps):
    """He et al. guided filter; guide and src are float32 in [0, 1]."""
    k = (2 * radius + 1, 2 * radius + 1)
    mean = lambda x: cv2.boxFilter(x, -1, k)
    mi, mp = mean(guide), mean(src)
    cov = mean(guide * src) - mi * mp
    var = mean(guide * guide) - mi * mi
    a = cov / (var + eps)
    b = mp - a * mi
    return mean(a) * guide + mean(b)


def person_alpha(logits_lr, frame_rgb):
    h, w = frame_rgb.shape[:2]
    logits = cv2.resize(logits_lr, (w, h), interpolation=cv2.INTER_LINEAR)
    hard = (logits > 0).astype(np.uint8)
    # keep only the largest connected component (the person), then fill holes
    n, cc, stats, _ = cv2.connectedComponentsWithStats(hard, connectivity=8)
    if n > 1:
        hard = (cc == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    inv = 1 - hard
    n, cc, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    border = set(np.unique(np.concatenate([cc[0], cc[-1], cc[:, 0], cc[:, -1]])))
    for i in range(1, n):
        if i not in border:
            hard[cc == i] = 1
    gray = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    alpha = guided_filter(gray, hard.astype(np.float32), radius=6, eps=1e-3)
    return np.clip(alpha, 0.0, 1.0)


# ---------------------------------------------------------------- layout + compositing

def compute_layout(args, src_w, src_h, face, top_src):
    """Canvas size, scale s, offset (tx, ty) of the source on the canvas, and the card rect."""
    if args.layout == "half":
        card = (0, round(src_h * (1 - args.keep_bottom)), src_w, src_h, 0)
        return dict(W=src_w, H=src_h, s=1.0, tx=0.0, ty=0.0, card=card, clamped=False)

    W, H = args.canvas
    m, r, card_h = round(args.card_margin * W), round(args.card_radius * W), round(args.card_height * H)
    card = (m, H - card_h, W - m, H, r)
    if args.scale:
        s = args.scale
    elif face is not None:
        s = args.face_height * H / face[3]
    else:
        s = W / src_w
    s = max(s, (W - 2 * m) / src_w, card_h / src_h)  # the scene must be able to fill the card
    cx = face[0] + face[2] / 2 if face is not None else src_w / 2
    tx = W / 2 - s * cx
    ty = H * (1 - args.head_top) - s * top_src
    # background first: clamp so the scaled frame covers the whole card
    ctx = min(max(tx, card[2] - s * src_w), card[0])
    cty = min(max(ty, H - s * src_h), card[1])
    return dict(W=W, H=H, s=s, tx=ctx, ty=cty, card=card, clamped=(ctx, cty) != (tx, ty))


def card_mask(W, H, card):
    """Float mask of the card with anti-aliased rounded top corners (it bleeds off the bottom)."""
    x0, y0, x1, y1, r = card
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) + 0.5
    inside = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    mask = inside.astype(np.float32)
    for cx, side in ((x0 + r, xx < x0 + r), (x1 - r, xx > x1 - r)):
        corner = side & (yy < y0 + r) & inside
        d = np.sqrt((xx[corner] - cx) ** 2 + (yy[corner] - (y0 + r)) ** 2)
        mask[corner] = np.clip(r - d + 0.5, 0.0, 1.0)
    return mask


def place(img, s, tx, ty, W, H):
    """Scale img by s and paste it at (tx, ty) on a W x H canvas (zeros elsewhere)."""
    h, w = img.shape[:2]
    sw, sh = round(w * s), round(h * s)
    if (sw, sh) != (w, h):
        img = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)
    out = np.zeros((H, W) + img.shape[2:], img.dtype)
    x, y = round(tx), round(ty)
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + sw), min(H, y + sh)
    if x1 > x0 and y1 > y0:
        out[y0:y1, x0:x1] = img[y0 - y:y1 - y, x0 - x:x1 - x]
    return out


def compose(rgb, logits_lr, L, card):
    """RGB + alpha on the canvas: the card shows the scene, the person shows everywhere."""
    a = place(person_alpha(logits_lr, rgb), L["s"], L["tx"], L["ty"], L["W"], L["H"])
    return place(rgb, L["s"], L["tx"], L["ty"], L["W"], L["H"]), np.maximum(a, card)


def hex_rgb(value):
    v = value.lstrip("#")
    return np.array([int(v[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("video")
    ap.add_argument("--out", required=True, help="output directory")
    ap.add_argument("--models", default=str(DEFAULT_MODELS), help="folder with the 3 SAM2Small*.mlpackage files")
    ap.add_argument("--compute-unit", choices=COMPUTE_UNITS, default=os.environ.get("SAM2_COMPUTE_UNIT", "all"),
                    help="Core ML compute units (default: all; env: SAM2_COMPUTE_UNIT)")
    g = ap.add_argument_group("prompt (default: derived from the detected face)")
    g.add_argument("--box", type=float, nargs=4, metavar=("X0", "Y0", "X1", "Y1"),
                   help="box around the person in source pixels")
    g.add_argument("--pos", type=float, nargs="+", default=[], help="positive points: x y x y ...")
    g.add_argument("--neg", type=float, nargs="+", default=[], help="negative points: x y x y ...")
    g = ap.add_argument_group("layout")
    g.add_argument("--layout", choices=["card", "half"], default="card")
    g.add_argument("--canvas", type=int, nargs=2, default=[1080, 1920], metavar=("W", "H"))
    g.add_argument("--card-height", type=float, default=500 / 1920, help="card height / canvas height")
    g.add_argument("--card-margin", type=float, default=64 / 1080, help="card side margin / canvas width")
    g.add_argument("--card-radius", type=float, default=64 / 1080, help="card corner radius / canvas width")
    g.add_argument("--head-top", type=float, default=630 / 1920,
                   help="target distance from head top to canvas bottom / canvas height")
    g.add_argument("--face-height", type=float, default=267 / 1920,
                   help="target face-detector box height / canvas height (sets the scale)")
    g.add_argument("--scale", type=float, help="fixed source->canvas scale (overrides --face-height)")
    g.add_argument("--keep-bottom", type=float, default=0.5,
                   help="half layout: fraction of the frame height, from the bottom, where the background is kept")
    g = ap.add_argument_group("output")
    g.add_argument("--smooth", type=int, default=1, help="temporal half-window in frames (0 = off)")
    g.add_argument("--test-frames", type=int, nargs="*",
                   help="only segment these frame indices and save test_XXXX.jpg previews")
    g.add_argument("--preview-only", action="store_true", help="skip the (large) ProRes 4444 .mov")
    g.add_argument("--preview-bg", default="#ECEAE4", help="preview background colour")
    args = ap.parse_args()

    out_dir = Path(args.out); out_dir.mkdir(parents=True, exist_ok=True)
    pairs = lambda v: list(zip(v[0::2], v[1::2]))
    if len(args.pos) % 2 or len(args.neg) % 2:
        sys.exit("--pos/--neg need an even number of values (x y pairs)")

    cap = cv2.VideoCapture(args.video)
    fps = cap.get(cv2.CAP_PROP_FPS)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames = []
    while True:
        ok, bgr = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    cap.release()
    if not frames:
        sys.exit(f"could not read any frames from {args.video}")
    print(f"{len(frames)} frames {w}x{h} @ {fps}fps", flush=True)

    face = detect_face(frames)
    print("face (x y w h):", None if face is None else np.round(face).astype(int).tolist(), flush=True)
    box, pos = args.box, pairs(args.pos)
    if box is None:
        if face is None:
            sys.exit("no face detected: pass --box (and --pos) manually")
        box, auto_pos = auto_prompt(face, w, h)
        pos = pos or auto_pos
    print("prompt box:", np.round(box).astype(int).tolist(),
          "pos:", [tuple(int(v) for v in p) for p in pos], flush=True)

    print(f"Core ML compute unit: {args.compute_unit}", flush=True)
    encoder, prompt_encoder, decoder = load_models(Path(args.models), COMPUTE_UNITS[args.compute_unit])
    sparse, dense = encode_prompt(prompt_encoder, box, pos, pairs(args.neg), w, h)

    idxs = args.test_frames if args.test_frames else range(len(frames))
    logits = {}
    for n, i in enumerate(idxs):
        masks, scores = segment_frame(encoder, decoder, frames[i], sparse, dense)
        logits[i] = masks[int(np.argmax(scores))]
        if n % 25 == 0:
            print(f"segmented {n + 1}/{len(idxs)}  scores={np.round(scores, 3).tolist()}", flush=True)

    stack = np.stack([logits[i] for i in idxs])
    if args.smooth > 0 and not args.test_frames:
        k = args.smooth
        padded = np.concatenate([stack[:1].repeat(k, 0), stack, stack[-1:].repeat(k, 0)])
        stack = np.mean([padded[j:j + len(stack)] for j in range(2 * k + 1)], axis=0)

    top_src = head_top(stack, h)
    L = compute_layout(args, w, h, face, top_src)
    W, H = L["W"], L["H"]
    top_canvas = L["ty"] + L["s"] * top_src
    print(f"layout {args.layout}: canvas {W}x{H}  scale {L['s']:.3f}  offset ({L['tx']:.0f}, {L['ty']:.0f})  "
          f"card {L['card'][:4]} r={L['card'][4]}  head top src y={top_src:.0f} -> canvas y={top_canvas:.0f} "
          f"({(H - top_canvas) / H:.1%} of height above bottom)"
          + ("  [clamped so the scene fills the card]" if L["clamped"] else ""), flush=True)

    card = card_mask(W, H, L["card"])
    bg = hex_rgb(args.preview_bg)

    if args.test_frames:
        for n, i in enumerate(idxs):
            rgb, a = compose(frames[i], stack[n], L, card)
            comp = rgb * a[..., None] + bg * (1 - a[..., None])
            path = out_dir / f"test_{i:04d}.jpg"
            Image.fromarray(comp.astype(np.uint8)).save(path, quality=90)
            print(f"saved {path}")
        return

    stem = Path(args.video).stem
    mov = out_dir / f"{stem}_{args.layout}_prores4444.mov"
    preview = out_dir / f"{stem}_{args.layout}_preview.mp4"
    common = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}",
              "-r", str(fps), "-i", "-", "-i", args.video, "-map", "0:v", "-map", "1:a?"]
    procs = []
    if not args.preview_only:
        procs.append(subprocess.Popen(
            common + ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
                      "-alpha_bits", "16", "-vendor", "apl0", "-c:a", "copy", str(mov)],
            stdin=subprocess.PIPE))
    p_prev = subprocess.Popen(common + ["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
                                        "-c:a", "copy", str(preview)], stdin=subprocess.PIPE)
    procs.append(p_prev)
    opaque = np.full((H, W), 255, np.uint8)
    for i, frame in enumerate(frames):
        rgb, a = compose(frame, stack[i], L, card)
        if not args.preview_only:
            procs[0].stdin.write(np.dstack([rgb, (a * 255 + 0.5).astype(np.uint8)]).tobytes())
        comp = (rgb * a[..., None] + bg * (1 - a[..., None])).astype(np.uint8)
        p_prev.stdin.write(np.dstack([comp, opaque]).tobytes())
        if i % 50 == 0:
            print(f"wrote {i + 1}/{len(frames)}", flush=True)
    for p in procs:
        p.stdin.close()
        if p.wait() != 0:
            sys.exit(f"ffmpeg failed ({p.args[-1]})")
    print("done:")
    for p in procs:
        print(f"  {p.args[-1]}")


if __name__ == "__main__":
    main()
