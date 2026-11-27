#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
export const hf = path.join(path.dirname(require.resolve('hyperframes/package.json')), 'bin/hyperframes.mjs');
const defaults = {
  layout: 'auto', motion: 'static', audio: 'result', duration: 0, cta: '',
  model: { name: 'YouMind', icon: 'assets/brand/youmind-mark.png', colors: ['#4F8DF7', '#B36CF2'] },
  prompt: { title: 'Prompt', text: '' },
  reference: { title: 'Reference', media: '', fit: 'cover', background: '#FFFFFF' },
  colors: { top: '#F7C29A', mid: '#FADBC6', bottom: '#FFF9F4', card: '#5F5F5F', cardInk: '#FFFFFF', ink: '#0D0D0D' }
};
const imageTypes = ['.jpg', '.jpeg', '.png', '.webp'], videoTypes = ['.mp4', '.mov', '.m4v', '.webm'];
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixed = value => Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

export function asset(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Media paths must be relative to templates/prompt-recipe: ' + relative);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error('Media path leaves the template folder: ' + relative);
  return resolved;
}
export function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ffprobe could not read ' + path.basename(file) + '.');
  const data = JSON.parse(result.stdout), video = data.streams.find(s => s.codec_type === 'video');
  if (!video) throw new Error('No video stream in ' + path.basename(file));
  const seconds = Number(video.duration || data.format.duration);
  const rotation = video.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0;
  const rotated = Math.abs(rotation % 180) === 90;
  return { width: rotated ? video.height : video.width, height: rotated ? video.width : video.height, seconds, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}

export function readConfig(file = path.join(root, 'template.json')) { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('template.json must be an object.');
  const c = { ...defaults, ...input, model: { ...defaults.model, ...input.model }, prompt: { ...defaults.prompt, ...input.prompt },
    reference: { ...defaults.reference, ...input.reference }, colors: { ...defaults.colors, ...input.colors } };
  if (!['auto', 'tall', 'wide'].includes(c.layout)) throw new Error('layout must be auto, tall or wide.');
  if (!['static', 'pop'].includes(c.motion)) throw new Error('motion must be static or pop.');
  if (!['cover', 'contain'].includes(c.reference.fit)) throw new Error('reference.fit must be cover or contain.');
  if (typeof c.result !== 'string' || !videoTypes.includes(path.extname(c.result).toLowerCase())) throw new Error('result must be a video (.mp4, .mov, .m4v or .webm).');
  if (c.reference.media && ![...imageTypes, ...videoTypes].includes(path.extname(c.reference.media).toLowerCase())) throw new Error('reference.media must be an image or a video.');
  if (typeof c.prompt.text !== 'string' || !c.prompt.text.trim() || c.prompt.text.length > 3000) throw new Error('prompt.text is required (up to 3000 characters).');
  for (const value of [c.model.name, c.prompt.title, c.reference.title]) if (typeof value !== 'string' || value.length > 40) throw new Error('Titles and the model name must be text up to 40 characters.');
  if (c.model.icon !== 'sparkle' && !(typeof c.model.icon === 'string' && [...imageTypes, '.svg'].includes(path.extname(c.model.icon).toLowerCase()))) throw new Error('model.icon must be sparkle or an image (.png, .svg, .jpg, .webp).');
  if (!Array.isArray(c.model.colors) || c.model.colors.length !== 2) throw new Error('model.colors must be two colours.');
  for (const color of [...c.model.colors, ...Object.values(c.colors), c.reference.background]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Colours must be #RRGGBB: ' + color);
  if (typeof c.cta !== 'string' || c.cta.length > 140) throw new Error('cta must be text up to 140 characters; wrap the comment keyword in {braces}.');
  if (!Number.isFinite(c.duration) || c.duration < 0) throw new Error('duration must be 0 (use the result length) or a positive number of seconds.');
  if (c.audio !== 'result' && c.audio !== 'none' && !videoTypes.concat(['.mp3', '.m4a', '.wav', '.aac']).includes(path.extname(c.audio).toLowerCase())) throw new Error('audio must be result, none, or an audio/video file.');
  return c;
}

// "Comment {skill} to get…" → the braced keyword becomes an ink chip; the line sits under the recipe (tall) or above the badge (wide).
function callToAction(text) {
  if (!text.trim()) return '';
  return '<span class="cta-line">' + esc(text.trim()).replace(/\{([^{}]+)\}/g, '<span class="kw">$1</span>') + '</span>';
}

function paragraphs(text) {
  return text.trim().split(/\n\s*\n/).map(p => '<p>' + esc(p.trim()).replaceAll('\n', '<br>') + '</p>').join('');
}

export function build(input = readConfig(), { write = true } = {}) {
  const config = normalizeConfig(input);
  const resultFile = asset(config.result), result = probe(resultFile);
  const layout = config.layout === 'auto' ? (result.height > result.width ? 'tall' : 'wide') : config.layout;
  const duration = config.duration || result.seconds;
  if (duration > result.seconds + 0.05) throw new Error('duration is longer than the result video (' + result.seconds.toFixed(2) + 's).');
  const clip = ' data-start="0" data-duration="' + fixed(duration) + '"';
  let referenceMedia = '';
  if (config.reference.media) {
    asset(config.reference.media);
    referenceMedia = imageTypes.includes(path.extname(config.reference.media).toLowerCase())
      ? '<img src="' + esc(config.reference.media) + '" alt="Reference">'
      : '<video id="reference-video" class="clip" src="' + esc(config.reference.media) + '"' + clip + ' data-track-index="2" muted playsinline preload="auto"></video>';
  }
  let audio = '';
  if (config.audio === 'result' && result.hasAudio) audio = config.result;
  else if (config.audio !== 'result' && config.audio !== 'none') { asset(config.audio); audio = config.audio; }
  // The badge icon is the YouMind mark by default; "sparkle" draws the generic four-point star in model.colors.
  const icon = config.model.icon === 'sparkle'
    ? `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="spark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${config.model.colors[0]}"/><stop offset="1" stop-color="${config.model.colors[1]}"/></linearGradient></defs><path fill="url(#spark)" d="M32 2c2.6 15.4 14.6 27.4 30 30-15.4 2.6-27.4 14.6-30 30C29.4 46.6 17.4 34.6 2 32 17.4 29.4 29.4 17.4 32 2Z"/></svg>`
    : (asset(config.model.icon), `<img src="${esc(config.model.icon)}" alt="">`);
  const tokens = {
    LAYOUT: layout, DURATION: fixed(duration), MOTION: config.motion === 'pop' ? 'true' : 'false',
    MODEL_NAME: esc(config.model.name), MODEL_ICON: icon, CTA: callToAction(config.cta),
    PROMPT_TITLE: esc(config.prompt.title), PROMPT_TEXT: paragraphs(config.prompt.text),
    REFERENCE_TITLE: esc(config.reference.title), REFERENCE_MEDIA: referenceMedia, REFERENCE_FIT: config.reference.fit, REFERENCE_BG: config.reference.background,
    RESULT_VIDEO: '<video id="result-video" class="clip" src="' + esc(config.result) + '"' + clip + ' data-track-index="1" muted playsinline preload="auto"></video>',
    AUDIO: audio ? '<audio id="soundtrack" class="clip" src="' + esc(audio) + '"' + clip + ' data-track-index="3" data-volume="1" preload="auto"></audio>' : '',
    BG_TOP: config.colors.top, BG_MID: config.colors.mid, BG_BOTTOM: config.colors.bottom, CARD: config.colors.card, CARD_INK: config.colors.cardInk, INK: config.colors.ink
  };
  const html = fs.readFileSync(path.join(root, 'scripts/prompt-recipe.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { layout, duration, width: 1080, height: 1920, audio: Boolean(audio) };
  if (!write) return { config, metadata, html };
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), html);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  console.log('Built prompt-recipe: ' + layout + ' layout, ' + duration.toFixed(2) + 's' + (audio ? ', with audio' : '') + '.');
  return { config, metadata, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' } } });
    const config = readConfig(values.config ? path.resolve(values.config) : undefined);
    const command = positionals[0] || 'build';
    if (command !== 'build') throw new Error('Usage: node scripts/build.mjs [build] [--config file.json]');
    build(config);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
