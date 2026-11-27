#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
function dependencyFile(name, fallback) { try { return require.resolve(name); } catch { return path.join(root, fallback); } }
export const hf = path.join(path.dirname(dependencyFile('hyperframes/package.json', 'node_modules/hyperframes/package.json')), 'bin/hyperframes.mjs');
const configPath = path.join(root, 'template.json');
const personaDir = path.join(root, 'assets/persona');
const manifestPath = path.join(personaDir, 'prepared.json');
export const defaultLayout = {
  brand: { x: 70, y: 120, width: 940, height: 48, fontSize: 40 },
  headline: { x: 60, y: 208, width: 960, height: 170, fontSize: 80 },
  visual: { x: 60, y: 430, width: 960, height: 660, radius: 36 },
  label: { x: 60, y: 1112, width: 960, height: 32, fontSize: 24 },
  captions: { x: 70, y: 1168, width: 940, height: 100, fontSize: 44 },
  persona: { x: 0, y: 1280, width: 1080, height: 640 }
};
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixed = value => Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
export function run(bin, args, capture = false) {
  const result = spawnSync(bin, args, { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: capture ? 'utf8' : undefined, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new Error(bin + ': ' + result.error.message);
  if (result.status !== 0) throw new Error(path.basename(bin) + ' failed (' + result.status + ').' + (capture ? '\n' + result.stderr : ''));
  return capture ? result.stdout : '';
}
export function asset(relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative)) throw new Error('素材必須是此專案內的相對路徑。請使用選取檔案匯入。');
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error('素材路徑超出專案範圍。');
  return resolved;
}
export function probe(file) {
  const data = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], true));
  const video = data.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('找不到影片軌：' + path.basename(file));
  const seconds = Number(video.duration || data.format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('無法讀取影片長度。');
  const rotation = video.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0;
  const rotated = Math.abs(rotation % 180) === 90;
  return { ...video, width: rotated ? video.height : video.width, height: rotated ? video.width : video.height, seconds, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}
export function digest(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try { let n; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
export function readConfig() { return normalizeConfig(JSON.parse(fs.readFileSync(configPath, 'utf8'))); }
export function normalizeConfig(input) {
  const c = structuredClone(input);
  if (!c || typeof c !== 'object' || !c.persona || !c.visual) throw new Error('缺少人物或上方素材設定。');
  c.layout = Object.fromEntries(Object.entries(defaultLayout).map(([key, value]) => [key, { ...value, ...c.layout?.[key] }]));
  c.layout.persona.height = c.layout.persona.width * 640 / 1080;
  for (const [key, box] of Object.entries(c.layout)) {
    for (const [field, value] of Object.entries(box)) {
      if (!Number.isFinite(value) || value < 0 || value > 1920) throw new Error(key + '.' + field + ' 必須是 0–1920 的數值。');
    }
    if (box.width < 40 || box.height < 20 || box.x + box.width > 1080 || box.y + box.height > 1920) throw new Error(key + ' 超出 1080 × 1920 畫面，請調整位置或尺寸。');
    if (box.fontSize !== undefined && (box.fontSize < 16 || box.fontSize > 160)) throw new Error('字體大小需為 16–160px。');
  }
  const person = c.layout.persona;
  person.height = person.width * 640 / 1080;
  if (person.y + person.height > 1920.01) throw new Error('人物區超出畫面底部。');
  for (const name of ['background', 'ink', 'accent']) if (!/^#[0-9a-f]{6}$/i.test(c[name])) throw new Error('請提供有效的六位數色碼。');
  if (!Array.isArray(c.headline) || c.headline.length > 2 || c.headline.some(s => typeof s !== 'string' || s.length > 100)) throw new Error('標題最多兩行，每行不超過 100 字。');
  for (const value of [c.brand, c.visual.label, c.fallbackCaption]) if (typeof value !== 'string' || value.length > 300) throw new Error('文字欄位需少於 300 字。');
  c.visual.fit = c.visual.fit || 'contain';
  if (!['cover', 'contain'].includes(c.visual.fit)) throw new Error('無效的上方素材顯示方式。');
  c.persona.width = 1080; c.persona.height = 640;
  c.persona.mode = c.persona.mode || 'auto';
  if (!['auto', 'original'].includes(c.persona.mode)) throw new Error('無效的人物顯示方式。');
  for (const [key, min, max] of [['cropY', 0, 10000], ['sceneTop', 0, 500], ['sceneInset', 0, 400], ['cornerRadius', 0, 250]]) {
    if (!Number.isInteger(c.persona[key]) || c.persona[key] < min || c.persona[key] > max) throw new Error('人物 ' + key + ' 超出範圍。');
  }
  return c;
}
export function cropFor(info, p) {
  const scale = Math.max(1080 / info.width, 640 / info.height);
  const width = Math.ceil(info.width * scale / 2) * 2;
  const height = Math.ceil(info.height * scale / 2) * 2;
  if (p.cropY > height - 640) throw new Error('人物裁切 Y 最大為 ' + (height - 640) + 'px，請調整裁切位置。');
  return { width, height, x: Math.floor((width - 1080) / 4) * 2, y: Math.floor(p.cropY / 2) * 2, maxY: height - 640 };
}
export function fingerprint(config, engine = 'hyperframes') {
  const framing = engine === 'sam2' ? { sceneTop: config.persona.sceneTop, sceneInset: config.persona.sceneInset, cornerRadius: config.persona.cornerRadius } : { cropY: config.persona.cropY };
  return createHash('sha256').update(digest(asset(config.persona.source))).update(JSON.stringify({ engine, ...framing, width: 1080, height: 640, version: 2 })).digest('hex');
}
export function preparedManifest(config) {
  try {
    const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = m.engine === 'sam2' ? [asset(m.overlay)] : ['scene.mp4', 'cutout.webm'].map(f => path.join(personaDir, f));
    return m.fingerprint === fingerprint(config, m.engine === 'sam2' ? 'sam2' : 'hyperframes') && files.every(f => fs.existsSync(f)) ? m : null;
  } catch { return null; }
}
export function prepared(config) { return Boolean(preparedManifest(config)); }
export function readCaptions(config, duration) {
  if (!config.captions) return config.fallbackCaption ? [{ start: 0, end: duration, text: config.fallbackCaption }] : [];
  return parseSrt(fs.readFileSync(asset(config.captions), 'utf8'), duration);
}
export function parseSrt(text, duration) {
  const seconds = text => {
    if (!/^\d{2}:\d{2}:\d{2}[,.]\d{3}$/.test(text.trim())) throw new Error('字幕時間格式不正確。');
    const [h, m, s] = text.replace(',', '.').split(':').map(Number); return h * 3600 + m * 60 + s;
  };
  const cues = text.replace(/^\uFEFF/, '').replaceAll('\r', '').trim().split(/\n\s*\n/).map(block => {
    const lines = block.split('\n'), timing = lines.findIndex(l => l.includes('-->'));
    if (timing < 0) throw new Error('SRT 字幕格式不正確。');
    const [a, b] = lines[timing].split(/\s*-->\s*/);
    return { start: seconds(a), end: Math.min(duration, seconds(b)), text: lines.slice(timing + 1).join(' ').trim() };
  }).filter(c => c.start < duration && c.end > c.start && c.text);
  for (let i = 0; i < cues.length; i++) if (i && cues[i].start < cues[i - 1].end) throw new Error('字幕時間有重疊。');
  return cues;
}
function posterFor(config, info) {
  if (config.visual.poster) { asset(config.visual.poster); return config.visual.poster; }
  const relative = 'assets/visuals/posters/' + digest(asset(config.visual.video)).slice(0, 16) + '.jpg';
  if (!fs.existsSync(path.join(root, relative))) {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.max(0, info.seconds - 0.08)), '-i', asset(config.visual.video), '-frames:v', '1', '-vf', 'scale=960:-2', path.join(root, relative)]);
  }
  return relative;
}
function cssLayout(layout) {
  const selectors = { brand: '#brand', headline: '#headline', visual: '#visual-shell', label: '#visual-label', captions: '#subtitle-zone', persona: '#persona' };
  return Object.entries(layout).map(([key, b]) => selectors[key] + '{margin-left:' + b.x + 'px;margin-top:' + b.y + 'px;width:' + b.width + 'px;height:' + b.height + 'px;' + (b.fontSize ? 'font-size:' + b.fontSize + 'px;' : '') + (b.radius !== undefined ? 'border-radius:' + b.radius + 'px;' : '') + '}').join('\n');
}
export function build(input = readConfig(), saveConfig = false, { write = true } = {}) {
  const config = normalizeConfig(input);
  const source = asset(config.persona.source), info = probe(source), duration = info.seconds;
  const crop = cropFor(info, config.persona), captions = readCaptions(config, duration);
  const manifest = preparedManifest(config), ready = Boolean(manifest), useCutout = ready && config.persona.mode !== 'original';
  const sam2 = useCutout && manifest.engine === 'sam2';
  const p = config.persona;
  const visualInfo = config.visual.video ? probe(asset(config.visual.video)) : null;
  const visualDuration = visualInfo ? Math.min(duration, visualInfo.seconds) : 0;
  const poster = visualInfo ? posterFor(config, visualInfo) : config.visual.poster;
  if (poster) asset(poster);
  const captionsHTML = captions.map((cue, i) => '<div id="caption-' + i + '" class="clip caption" data-start="' + fixed(cue.start) + '" data-duration="' + fixed(cue.end - cue.start) + '" data-track-index="6"><span class="caption-text' + (/comment.*skill/i.test(cue.text) ? ' accent' : '') + '">' + esc(cue.text) + '</span></div>').join('\n');
  const captionAnimations = captions.map((cue, i) => "tl.from('#caption-" + i + " .caption-text', {opacity:0,y:4,duration:0.08,ease:'power2.out'}," + fixed(cue.start) + ");tl.set('#caption-" + i + " .caption-text',{opacity:0}," + fixed(cue.end) + ');').join('\n');
  const sceneTop = useCutout ? p.sceneTop : 0;
  const videoAttrs = ' class="clip" data-start="0" data-duration="' + fixed(duration) + '" data-media-start="0" muted playsinline preload="auto"';
  const tokens = {
    DURATION: fixed(duration), BRAND: esc(config.brand), HEADLINE: config.headline.map(line => '<span>' + esc(line) + '</span>').join(''),
    VISUAL_POSTER: poster ? '<img id="visual-poster" class="clip" src="' + esc(poster) + '" alt="Visual content" data-start="0" data-duration="' + fixed(duration) + '" data-track-index="0">' : '',
    VISUAL_VIDEO: visualInfo ? '<video id="visual-video" class="clip visual-video" src="' + esc(config.visual.video) + '" data-start="0" data-duration="' + fixed(visualDuration) + '" data-track-index="1" muted playsinline preload="auto"></video>' : '',
    VISUAL_LABEL: esc(config.visual.label), VISUAL_FIT: config.visual.fit,
    CAPTIONS: captionsHTML, CAPTION_ANIMATIONS: captionAnimations,
    AUDIO: info.hasAudio ? '<audio id="persona-audio" class="clip" src="' + esc(config.persona.source) + '" data-start="0" data-duration="' + fixed(duration) + '" data-track-index="7" data-volume="1" preload="auto"></audio>' : '',
    BACKGROUND: config.background, INK: config.ink, ACCENT: config.accent, LAYOUT_CSS: cssLayout(config.layout),
    PERSONA_SCALE: fixed(config.layout.persona.width / 1080), SCENE_TOP: sceneTop, SCENE_HEIGHT: 640 - sceneTop, SCENE_INSET: p.sceneInset,
    SCENE_WIDTH: 1080 - p.sceneInset * 2, CORNER_RADIUS: p.cornerRadius,
    SCENE_VIDEO: sam2 ? '' : '<video id="persona-scene"' + videoAttrs + ' src="' + esc(useCutout ? 'assets/persona/scene.mp4' : config.persona.source) + '" data-track-index="3" style="width:' + (useCutout ? 1080 : crop.width) + 'px;height:' + (useCutout ? 640 : crop.height) + 'px;left:-' + ((useCutout ? 0 : crop.x) + p.sceneInset) + 'px;top:-' + ((useCutout ? 0 : crop.y) + sceneTop) + 'px"></video>',
    CUTOUT_VIDEO: sam2 ? '<video id="persona-overlay"' + videoAttrs + ' src="' + esc(manifest.overlay) + '" data-track-index="4" data-layout-allow-overflow></video>' : useCutout ? '<video id="persona-cutout"' + videoAttrs + ' src="assets/persona/cutout.webm" data-track-index="4"></video>' : ''
  };
  const html = fs.readFileSync(path.join(root, 'scripts/news-channel.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { duration, width: 1080, height: 1920, captions, personaPrepared: ready, personaMode: sam2 ? 'sam2' : useCutout ? 'cutout' : 'original', runtimeInstalled: fs.existsSync(hf), visualDuration, crop, layout: config.layout, audio: info.hasAudio };
  if (!write) return { config, metadata, html };
  const gsap = dependencyFile('gsap/dist/gsap.min.js', 'node_modules/gsap/dist/gsap.min.js');
  if (!fs.existsSync(gsap)) throw new Error('請先在根目錄執行 pnpm install 完成初次安裝。');
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(gsap, path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), html);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  fs.writeFileSync(path.join(root, 'analysis/hyperframes-build.json'), JSON.stringify(metadata, null, 2) + '\n');
  if (saveConfig) fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Built 1080 × 1920, ' + duration.toFixed(2) + 's. Persona: ' + metadata.personaMode + '.');
  return { config, metadata };
}
export function prepare(config = readConfig()) {
  if (!fs.existsSync(hf)) throw new Error('HyperFrames is not installed. Run pnpm install.');
  if (prepared(config)) { console.log('Reusing the prepared person cutout.'); return; }
  const source = asset(config.persona.source), info = probe(source), crop = cropFor(info, config.persona);
  fs.mkdirSync(personaDir, { recursive: true });
  const staging = fs.mkdtempSync(path.join(personaDir, '.preparing-'));
  console.log('Preparing ' + path.basename(source) + ' (' + info.seconds.toFixed(2) + 's). First use downloads the segmentation model.');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-map', '0:v:0', '-vf', 'scale=' + crop.width + ':' + crop.height + ',crop=1080:640:' + crop.x + ':' + crop.y + ',setsar=1', '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(staging, 'scene.mp4')]);
  run(hf, ['remove-background', path.join(staging, 'scene.mp4'), '-o', path.join(staging, 'cutout.webm'), '--quality', 'balanced']);
  const cutout = probe(path.join(staging, 'cutout.webm'));
  if (cutout.width !== 1080 || cutout.height !== 640) throw new Error('Cutout dimensions do not match.');
  if (String(cutout.tags?.alpha_mode) !== '1' && !String(cutout.pix_fmt).includes('a')) throw new Error('The output has no alpha channel.');
  if (Math.abs(cutout.seconds - info.seconds) > .12) throw new Error('Cutout/source duration mismatch.');
  for (const file of ['scene.mp4', 'cutout.webm']) fs.renameSync(path.join(staging, file), path.join(personaDir, file));
  fs.rmdirSync(staging);
  fs.writeFileSync(manifestPath, JSON.stringify({ source: config.persona.source, duration: info.seconds, fingerprint: fingerprint(config), crop, engine: 'hyperframes remove-background' }, null, 2) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2] || 'build';
    if (command === 'build') build();
    else if (command === 'prepare') {
      let config = readConfig();
      if (process.argv[3]) {
        const input = path.resolve(process.argv[3]), info = probe(input);
        const destination = path.join(root, 'source/persona-' + digest(input).slice(0, 12) + path.extname(input).toLowerCase());
        if (input !== destination) fs.copyFileSync(input, destination);
        config.persona.source = path.relative(root, destination); config.captions = '';
        const maxY = cropFor(info, { cropY: 0 }).maxY;
        config.persona.cropY = Math.min(config.persona.cropY, maxY);
        config = build(config, true).config;
      }
      prepare(config); build(config);
    } else if (command === 'start') {
      build(); run(hf, ['lint', '.']); run(hf, ['preview', '.', '--port', '3017']);
    } else throw new Error('Use build, prepare, or start.');
  } catch (error) { console.error('\n' + error.message); process.exitCode = 1; }
}
