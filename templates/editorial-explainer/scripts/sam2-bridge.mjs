#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root, readConfig, normalizeConfig, asset, probe, run, fingerprint, build, preparedManifest } from './hyperframes-project.mjs';
export const sam2Repo = path.resolve(process.env.SAM2_DIR || path.join(root, '../../tools/sam2'));
const repo = sam2Repo;
const testsFile = path.join(root, 'assets/persona/sam2-tests.json');
export function sam2Tests(config = readConfig()) {
  try { const data = JSON.parse(fs.readFileSync(testsFile)); return data.fingerprint === fingerprint(config, 'sam2') && data.images.every(f => fs.existsSync(asset(f))) ? data : null; }
  catch { return null; }
}
function sam2Args(config) {
  return ['--card-height', String((640 - config.persona.sceneTop) / 1920), '--card-margin', String(config.persona.sceneInset / 1080), '--card-radius', String(config.persona.cornerRadius / 1080), '--head-top', String(630 / 1920), '--smooth', '2'];
}
function executeSam2(config, out, extra = []) {
  const python = path.join(repo, '.venv/bin/python');
  if (!fs.existsSync(python)) throw new Error('找不到 SAM2 環境：' + repo + '。請在 monorepo 根目錄執行 npm run setup:sam2。');
  for (const part of ['ImageEncoder', 'PromptEncoder', 'MaskDecoder']) {
    if (!fs.existsSync(path.join(repo, 'models/coreml-sam2-small/SAM2Small' + part + 'FLOAT16.mlpackage/Manifest.json'))) throw new Error('缺少 SAM2 模型，請在 monorepo 根目錄執行 npm run setup:sam2。');
  }
  const result = spawnSync(python, ['-u', path.join(repo, 'sam2_person_cutout.py'), asset(config.persona.source), '--out', out, ...sam2Args(config), ...extra], { cwd: repo, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('SAM2 處理未完成，請查看上方紀錄。');
}
export function importOverlay(input, config = readConfig()) {
  const info = probe(input), source = probe(asset(config.persona.source));
  if (info.width !== 1080 || info.height !== 1920 || !String(info.pix_fmt).startsWith('yuva')) throw new Error('需為 1080×1920、具有透明通道的 SAM2 ProRes 輸出。');
  if (Math.abs(info.seconds - source.seconds) > .12 || (info.nb_frames && source.nb_frames && info.nb_frames !== source.nb_frames)) throw new Error('SAM2 輸出與人物原片的長度或幀數不同。');
  const id = fingerprint(config, 'sam2');
  const relative = 'assets/persona/sam2-' + id.slice(0, 16) + '.webm';
  const output = path.join(root, relative), temporary = output + '.partial.webm';
  console.log('Converting the verified SAM2 alpha layer for browser playback…');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', '-i', input, '-map', '0:v:0', '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '23', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-threads', '6', '-auto-alt-ref', '0', temporary]);
  const check = probe(temporary);
  if (String(check.tags?.alpha_mode) !== '1' || Math.abs(check.seconds - source.seconds) > .12) throw new Error('透明通道或影片長度驗證失敗。');
  fs.renameSync(temporary, output);
  fs.writeFileSync(path.join(root, 'assets/persona/prepared.json'), JSON.stringify({ engine: 'sam2', fingerprint: id, overlay: relative, source: config.persona.source, duration: source.seconds, width: 1080, height: 1920 }, null, 2) + '\n');
  return build(config);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const configIndex = process.argv.indexOf('--config');
    const config = configIndex < 0 ? readConfig() : normalizeConfig(JSON.parse(fs.readFileSync(process.argv[configIndex + 1], 'utf8')));
    const command = process.argv[2];
    if (command === 'import') importOverlay(path.resolve(process.argv[3]), config);
    else if (command === 'test' || command === 'prepare') {
      fs.mkdirSync(path.join(root, '.cache/sam2'), { recursive: true });
      const out = fs.mkdtempSync(path.join(root, '.cache/sam2/run-'));
      if (command === 'test') {
        const info = probe(asset(config.persona.source));
        const fps = info.r_frame_rate.split('/').map(Number);
        const count = Number(info.nb_frames) || Math.round(info.seconds * fps[0] / fps[1]);
        const indices = [...new Set([0, .25, .5, .75, 1].map(p => Math.round((count - 1) * p)))];
        executeSam2(config, out, ['--test-frames', ...indices.map(String)]);
        const folder = 'assets/persona/sam2-tests/' + fingerprint(config, 'sam2').slice(0, 16);
        fs.mkdirSync(path.join(root, folder), { recursive: true });
        const images = indices.map(i => { const name = 'test_' + String(i).padStart(4, '0') + '.jpg'; fs.copyFileSync(path.join(out, name), path.join(root, folder, name)); return folder + '/' + name; });
        fs.writeFileSync(testsFile, JSON.stringify({ fingerprint: fingerprint(config, 'sam2'), images }, null, 2) + '\n');
        console.log('抽樣完成。請查看五張預覽，確認髮絲、肩膀與背景後再產生完整圖層。');
      } else {
        if (preparedManifest(config)?.engine === 'sam2') { console.log('Reusing the prepared person layer.'); build(config); process.exit(0); }
        if (!sam2Tests(config)) throw new Error('請先產生並檢查 SAM2 抽樣預覽。');
        executeSam2(config, out);
        const mov = path.join(out, path.parse(config.persona.source).name + '_card_prores4444.mov');
        importOverlay(mov, config);
      }
    } else throw new Error('Use test, prepare, or import <SAM2 ProRes.mov>.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
