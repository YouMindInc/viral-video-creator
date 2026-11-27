#!/usr/bin/env python3
"""Extract selected presentation states, not codec I-frames. Requires FFmpeg + Pillow."""
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source/free-skills-share.mp4'
OUT = ROOT / 'analysis'
FRAMES = [
    ('01-hook', .5, 'Hook', '18 free skills. One animation studio.'),
    ('02-attribution', 3.3, 'Attribution', 'Built with Claude Opus 5.5.'),
    ('03-repository-list', 4.6, 'Evidence', '18 free open-source skills'),
    ('04-repository-scroll', 7.2, 'Evidence continues', 'for Opus 5.5.'),
    ('05-scenes', 8.4, 'Capability: scenes', 'Motion Canvas'),
    ('06-timelines', 9.3, 'Capability: timelines', 'TweenJS'),
    ('07-vectors', 10.1, 'Capability: vectors', 'Two.js'),
    ('08-particles', 10.9, 'Capability: particles', 'Proton'),
    ('09-export', 11.9, 'Capability: export', 'gifenc'),
    ('10-summary', 13.4, 'Summary', 'A full animation studio in 18 repos.'),
    ('11-call-to-action', 16.4, 'Call to action', 'Comment “Skill”'),
    ('12-delivery-promise', 17.6, 'Delivery promise', 'and I’ll send you all 18.'),
]

def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)

def main():
    (OUT / 'keyframes').mkdir(parents=True, exist_ok=True)
    (ROOT / 'templates/assets/visuals').mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, time, beat, text in FRAMES:
        target = OUT / 'keyframes' / f'{name}.png'
        ffmpeg('-ss', time, '-i', SOURCE, '-frames:v', 1, '-update', 1, target)
        visual = ROOT / 'templates/assets/visuals' / f'{name}.jpg'
        ffmpeg('-ss', time, '-i', SOURCE, '-vf', 'crop=960:660:60:430', '-frames:v', 1, '-q:v', 2, '-update', 1, visual)
        manifest.append({'id':name, 'frame':round(time*30), 'seconds':time, 'beat':beat, 'visible_text':text,
                         'image':str(target.relative_to(ROOT)), 'visual_crop':str(visual.relative_to(ROOT))})
    (OUT / 'keyframes.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
    # Contact-sheet annotations surround unmodified extracted video frames.
    sheet = Image.new('RGB', (1260, 1970), '#E9EAE1')
    d = ImageDraw.Draw(sheet)
    font_path = '/System/Library/Fonts/Helvetica.ttc'
    try:
        title = ImageFont.truetype(font_path, 29)
        label = ImageFont.truetype(font_path, 17)
    except OSError:
        title = label = ImageFont.load_default()
    d.text((30, 22), 'FREE SKILLS SHARE  /  KEY FRAMES', font=title, fill='#14160F')
    d.text((30, 65), '1080 × 1920  ·  30 fps  ·  18.767s visual duration  ·  source reference', font=label, fill='#62675B')
    for i, item in enumerate(manifest):
        x = 30 + (i%4)*307
        y = 112 + (i//4)*608
        im = Image.open(ROOT/item['image']).resize((276, 491), Image.Resampling.LANCZOS)
        sheet.paste(im, (x,y))
        d.text((x, y+504), f"{i+1:02d}   {item['seconds']:05.2f}s", font=title, fill='#14160F')
        d.text((x, y+548), item['beat'], font=label, fill='#62675B')
    sheet.save(OUT/'keyframes-contact-sheet.jpg', quality=94)
    print(f'Extracted {len(manifest)} full-resolution frames, visual crops, and contact sheet.')

if __name__ == '__main__':
    main()
