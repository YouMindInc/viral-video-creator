# News channel visual design

## Style

Rebuild the three-zone composition in `source/free-skills-share.mp4`: top visual content, middle subtitles, bottom talking-person video cutout. Use the source's warm ivory canvas, black editorial serif headlines, softly rounded visual panel, and compact charcoal subtitle pill. The person's head extends above a rounded window of the original scene. These regions remain stable while content changes.

The bottom uses the actual character's moving footage, cut along the person's silhouette. Preserve the person's original appearance. Keep a rounded section of the same source scene behind the person. The flat silhouette in the template image is only a placement placeholder. Replace the source video for each episode and regenerate the person cutout; keep the layout reusable. See [the bottom video definition](ARCHITECTURE.md#what-the-bottom-video-actually-is).

## Colors

| Role | Color |
| --- | --- |
| Canvas | `#E9EAE1` |
| Headline | `#14160F` |
| Visual placeholder | `#DDE2D3` |
| Secondary text | `#62675B` |
| Subtitle background | `#50514D` |
| Subtitle foreground | `#FFFFFF` |
| Accent | `#C77C63` |
| Persona placeholder only | `#858D78` |

## Typography

Use Georgia for the editable headline and brand, with Helvetica/Arial for subtitles and labels. These are local system-font approximations of the raster reference, not an identification of its original fonts. Headlines are 80px, subtitles 44px bold, panel labels 24px on a 1080px-wide canvas.

## Layout

The canonical canvas is 1080 × 1920. Brand block: x=70, y=120, width=940, height=48. Headline block: x=60, y=208, width=960, height=170. Visual panel: x=60, y=430, width=960, height=660. Visual label center: (540, 1128). Subtitle zone: x=70, y=1168, width=940, height=100. Persona region: y=1280–1920; backdrop x=64, y=1420, width=952, height=500. Coordinates are practical measurements rounded from the source, exposed in the local template editor.

## Motion

Keep the frame and persona placement steady. Animate content inside the visual panel. Use brief 160ms dissolves between top-panel assets in the editable demo; the source itself has sharp changes and moving/scrolling content. Caption groups replace one another at measured frame boundaries. Preserve clear space between captions and the persona's head.

## Avoid

- Do not combine the visual, caption, and persona into one replacement image.
- Do not place captions over the persona's face.
- Do not give the top panel and bottom persona equal height.
- Do not add bright gradients, news tickers, or unrelated dashboard decoration.
- Do not treat reference-copy claims as independently verified product facts.
