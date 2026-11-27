#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { root, hf, asset, probe, digest, cropFor, readConfig, normalizeConfig, parseSrt, preparedManifest, build } from './hyperframes-project.mjs';
import { sam2Repo, sam2Tests } from './sam2-bridge.mjs';

const repo = path.resolve(root, '../..');
const whisperModel = process.env.WHISPER_MODEL || path.join(os.homedir(), '.cache/whisper-cpp-models/ggml-large-v3-turbo.bin');
const help = `使用方式：pnpm generate:editorial-explainer [選項]

依序提供人物錄影、上方內容影片、品牌、兩行標題、標籤和字幕。
可把 Finder 檔案拖入 Terminal；Enter 沿用預設值，文字輸入 - 可清空。
輸出：renders/editorial-explainer/<時間>/video.mp4（1080×1920，30 fps）

  --current        直接使用目前 template.json，不詢問素材
  --prepare-only   只匯入素材與建置，不執行 SAM2 或輸出影片
  --quality        standard（預設）、draft 或 high
  --no-open        完成後不自動開啟影片或 SAM2 抽樣圖
  --help           顯示說明

新人物會先顯示 SAM2 抽樣圖，確認輪廓後繼續。已處理的人物會直接重用。
字幕可輸入 SRT 路徑、auto（本機 Whisper）或 none；同一支人物可用 keep。
`;

export function materialPath(value, cwd = process.env.INIT_CWD || process.cwd()) {
  let name = value.trim();
  const quoted = (name.startsWith('"') && name.endsWith('"')) || (name.startsWith("'") && name.endsWith("'"));
  if (quoted) name = name.slice(1, -1);
  else name = name.replace(/\\([\s()\[\]{}'"&;$`!#])/g, '$1');
  if (name.startsWith('file://')) name = fileURLToPath(name);
  if (name.startsWith('~/')) name = path.join(os.homedir(), name.slice(2));
  if (!name) throw new Error('請提供一個檔案路徑。');
  const file = fs.realpathSync(path.resolve(cwd, name));
  if (!fs.statSync(file).isFile()) throw new Error('請選取檔案，不是資料夾。');
  return file;
}

export class Questions {
  constructor(input = process.stdin, output = process.stdout) {
    this.output = output;
    this.rl = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    this.lines = this.rl[Symbol.asyncIterator]();
    this.rl.on('SIGINT', () => this.close());
  }
  async ask(label, fallback, validate = value => value) {
    for (;;) {
      this.output.write(`\n${label}${fallback ? ` [${fallback}]` : ''}\n> `);
      const next = await this.lines.next();
      if (next.done) throw new Error('輸入已結束，已停止。');
      try { return await validate(next.value.trim() || fallback || ''); }
      catch (error) { this.output.write(`  ${error.message}\n`); }
    }
  }
  close() { this.rl.close(); }
}

const videoFile = value => {
  const file = materialPath(value);
  if (!['.mp4', '.mov', '.m4v', '.webm'].includes(path.extname(file).toLowerCase())) throw new Error('請使用 MP4、MOV、M4V 或 WebM。');
  return { file, info: probe(file) };
};
const textField = max => value => {
  if (value.length > max) throw new Error(`最多 ${max} 字。`);
  return value === '-' ? '' : value;
};
const choice = choices => value => {
  const key = value.toLowerCase();
  if (!choices.includes(key)) throw new Error('請輸入 ' + choices.join(' / ') + '。');
  return key;
};
function hasWhisper() {
  return fs.existsSync(whisperModel) && !spawnSync('whisper-cli', ['--help'], { stdio: 'ignore', timeout: 5000 }).error;
}

export async function collectMaterials(questions, base = readConfig()) {
  const config = structuredClone(base);
  const person = await questions.ask('1/8 下半部：人物錄影路徑', asset(base.persona.source), videoFile);
  const visual = await questions.ask('2/8 上半部：產品、分享內容或動畫影片路徑', base.visual.video ? asset(base.visual.video) : '', videoFile);
  const samePerson = digest(person.file) === digest(asset(base.persona.source));
  config.brand = await questions.ask('3/8 品牌名稱（- 清空）', base.brand, textField(300));
  config.headline = [
    await questions.ask('4/8 標題第一行（- 清空）', base.headline[0] || '', textField(100)),
    await questions.ask('5/8 標題第二行（- 清空）', base.headline[1] || '', textField(100))
  ];
  config.visual.label = await questions.ask('6/8 上方內容標籤（- 清空）', base.visual.label, textField(300));
  const captions = await questions.ask('7/8 字幕：SRT 路徑 / auto 自動辨識 / none 無字幕' + (samePerson ? ' / keep 沿用' : ''),
    samePerson ? 'keep' : person.info.hasAudio && hasWhisper() ? 'auto' : 'none', value => {
      const mode = value.toLowerCase();
      if (mode === 'keep') { if (!samePerson) throw new Error('換了人物錄影，請提供新字幕或選 auto / none。'); return { mode }; }
      if (mode === 'none') return { mode };
      if (mode === 'auto') {
        if (!person.info.hasAudio) throw new Error('人物影片沒有音軌，請提供 SRT 或選 none。');
        if (!hasWhisper()) throw new Error('找不到 whisper-cli 或本機模型。請提供 SRT 或選 none；可用 WHISPER_MODEL 指定既有模型。');
        return { mode };
      }
      const file = materialPath(value);
      if (path.extname(file).toLowerCase() !== '.srt' || fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('請提供小於 2MB 的 SRT 字幕。');
      if (!parseSrt(fs.readFileSync(file, 'utf8'), person.info.seconds).length) throw new Error('SRT 在人物影片時間內沒有有效字幕。');
      return { mode: 'file', file };
    });
  const mode = await questions.ask('8/8 人物樣式：sam2 人物輪廓＋圓角場景 / original 原片裁切', base.persona.mode === 'original' ? 'original' : 'sam2', choice(['sam2', 'original']));
  config.persona.mode = mode === 'sam2' ? 'auto' : 'original';
  config.persona.cropY = Math.min(config.persona.cropY, cropFor(person.info, { cropY: 0 }).maxY);
  if (captions.mode !== 'keep') { config.captions = ''; config.fallbackCaption = ''; }
  return { config: normalizeConfig(config), person, visual, captions };
}

export function importMaterial(file, kind) {
  // Existing project files need no copy. New inputs get immutable, content-based names.
  const actual = fs.realpathSync(file);
  if (actual.startsWith(root + path.sep)) return path.relative(root, actual);
  const relative = `assets/inputs/${kind}-${digest(actual).slice(0, 20)}${path.extname(actual).toLowerCase()}`;
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(actual, target, fs.constants.COPYFILE_EXCL);
  return relative;
}

export function snapshotProject(html, target) {
  fs.mkdirSync(target, { recursive: true });
  const files = new Set([
    ...[...html.matchAll(/\bsrc="([^"]+)"/g)].map(m => m[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')),
    ...[...html.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)].map(m => m[1])
  ]);
  for (const relative of files) {
    const from = asset(relative); // Reject external paths and links outside the template.
    const to = path.resolve(target, relative);
    if (!to.startsWith(path.resolve(target) + path.sep)) throw new Error('無效的素材路徑。');
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
  }
  fs.writeFileSync(path.join(target, 'index.html'), html, { flag: 'wx' });
}

function acquireLock() {
  const lock = path.join(root, '.cache/generate.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('產生器鎖定檔無效：' + lock);
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new Error('另一個產生器仍在執行，請先等它完成。');
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  return () => fs.unlinkSync(lock);
}

export function command(bin, args, { cwd = root, log, signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('已取消。')); return; }
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    let tail = '';
    const record = (chunk, stream) => {
      stream.write(chunk);
      log?.write(chunk);
      tail = (tail + chunk.toString()).slice(-3000);
    };
    child.stdout.on('data', chunk => record(chunk, process.stdout));
    child.stderr.on('data', chunk => record(chunk, process.stderr));
    const cancel = () => {
      try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGTERM'); } catch {}
    };
    signal?.addEventListener('abort', cancel, { once: true });
    child.once('error', error => { signal?.removeEventListener('abort', cancel); reject(new Error(`${path.basename(bin)}：${error.message}`)); });
    child.once('close', (code, killedBy) => {
      signal?.removeEventListener('abort', cancel);
      if (signal?.aborted) reject(new Error('已取消。'));
      else if (code !== 0) reject(new Error(`${path.basename(bin)} 未完成（${killedBy || code}）。\n${tail.trim()}`));
      else resolve();
    });
  });
}

async function openFile(file, noOpen) {
  if (noOpen || process.platform !== 'darwin') return;
  try { await command('open', [file]); } catch { console.log('可手動開啟：' + file); }
}

export function verifyOutput(file, expected) {
  const result = probe(file);
  if (result.width !== 1080 || result.height !== 1920 || Math.abs(result.seconds - expected.duration) > 0.15 || result.hasAudio !== expected.audio) {
    throw new Error('輸出影片的尺寸、長度或音軌與設定不同；請檢查 render.log。');
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const { values: options } = parseArgs({ args: argv.filter(arg => arg !== '--'), options: {
    help: { type: 'boolean' }, current: { type: 'boolean' }, 'prepare-only': { type: 'boolean' },
    'no-open': { type: 'boolean' }, quality: { type: 'string', default: 'standard' }
  } });
  if (options.help) { console.log(help); return; }
  if (!['standard', 'draft', 'high'].includes(options.quality)) throw new Error('--quality 請使用 standard、draft 或 high。');
  if (!fs.existsSync(hf)) throw new Error('請先在 monorepo 根目錄執行 pnpm install --frozen-lockfile。');
  console.log('\nEditorial explainer · 1080×1920\n上方內容 → 中間字幕 → 下方人物。Enter 沿用，文字 - 清空。');
  const questions = options.current ? null : new Questions();
  const abort = new AbortController();
  const cancel = () => { abort.abort(); questions?.close(); };
  questions?.rl.on('SIGINT', cancel);
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  let release, log, runDir, job;
  const status = (stage, extra = {}) => {
    Object.assign(job, { stage, updatedAt: new Date().toISOString(), ...extra });
    fs.writeFileSync(path.join(runDir, 'job.json'), JSON.stringify(job, null, 2) + '\n');
    console.log('\n' + stage);
  };
  try {
    const materials = questions ? await collectMaterials(questions) : null;
    let config = materials?.config || readConfig();
    if (abort.signal.aborted) throw new Error('已取消。');
    release = acquireLock();
    const outputRoot = path.join(repo, 'renders/editorial-explainer');
    fs.mkdirSync(outputRoot, { recursive: true });
    runDir = fs.mkdtempSync(path.join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-') + '-'));
    log = fs.createWriteStream(path.join(runDir, 'render.log'));
    job = { startedAt: new Date().toISOString(), quality: options.quality, status: 'running' };
    const run = (bin, args) => command(bin, args, { log, signal: abort.signal });
    fs.copyFileSync(path.join(root, 'template.json'), path.join(runDir, 'previous-template.json'));
    status('1/5 匯入素材');
    if (materials) {
      config.persona.source = importMaterial(materials.person.file, 'persona');
      if (!config.visual.video || digest(materials.visual.file) !== digest(asset(config.visual.video))) config.visual.poster = '';
      config.visual.video = importMaterial(materials.visual.file, 'visual');
      if (materials.captions.mode === 'file') config.captions = importMaterial(materials.captions.file, 'captions');
      if (materials.captions.mode === 'auto') {
        status('1/5 使用本機 Whisper 產生字幕（不需下載模型）');
        const wav = path.join(runDir, 'speech.wav'), prefix = path.join(runDir, 'captions');
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', asset(config.persona.source), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
        await run('whisper-cli', ['-m', whisperModel, '-f', wav, '-l', 'auto', '-osrt', '-of', prefix, '-ml', '38', '-sow', '-ng', '-t', '8']);
        if (!parseSrt(fs.readFileSync(prefix + '.srt', 'utf8'), materials.person.info.seconds).length) throw new Error('Whisper 沒有辨識到字幕，請改用 SRT 或 none。');
        config.captions = importMaterial(prefix + '.srt', 'captions');
        fs.unlinkSync(wav);
      }
    }
    config = normalizeConfig(config);
    const configFile = path.join(runDir, 'template.json');
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n');
    build(config, false, { write: false }); // Validate all inputs before touching the active template.
    console.log('本次輸出資料夾：' + runDir);
    if (!options['prepare-only'] && config.persona.mode !== 'original') {
      if (preparedManifest(config)?.engine === 'sam2') console.log('2/5 重用已完成的 SAM2 人物輪廓與圓角場景。');
      else {
        if (options.current) throw new Error('目前人物尚無 SAM2 圖層。請執行 pnpm generate:editorial-explainer，查看抽樣圖後繼續。');
        status('2/5 SAM2 五張抽樣（首次載入 Core ML 可能需要約一分鐘）');
        const bridge = path.join(root, 'scripts/sam2-bridge.mjs');
        if (!fs.existsSync(path.join(sam2Repo, '.venv/bin/python'))) throw new Error('找不到 SAM2 環境。請執行 pnpm setup:sam2。');
        if (!sam2Tests(config)) await run(process.execPath, [bridge, 'test', '--config', configFile]);
        const samples = sam2Tests(config);
        if (!samples?.images.length) throw new Error('SAM2 抽樣未完成。');
        const sheet = path.join(runDir, 'sam2-samples.jpg');
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...samples.images.flatMap(file => ['-i', asset(file)]), '-filter_complex', `hstack=inputs=${samples.images.length},scale=1800:-1`, '-frames:v', '1', sheet]);
        console.log('抽樣圖：' + sheet);
        await openFile(sheet, options['no-open']);
        const answer = await questions.ask('請查看抽樣圖：髮絲、肩膀、手部及背景框都正確？yes 繼續 / no 停止', 'no', choice(['yes', 'no']));
        if (answer !== 'yes') throw new Error('已保留素材與抽樣圖，尚未開始完整去背。調整人物設定後可重新執行。');
        status('2/5 SAM2 完整去背與透明影片轉檔（會顯示幀數進度）');
        await run(process.execPath, [bridge, 'prepare', '--config', configFile]);
        if (preparedManifest(config)?.engine !== 'sam2') throw new Error('未找到與本次人物相符的 SAM2 透明圖層。');
      }
    }
    status('3/5 建置模板與保存本次 composition');
    const built = build(config, true);
    if (!options['prepare-only'] && config.persona.mode !== 'original' && built.metadata.personaMode !== 'sam2') throw new Error('人物圖層在建置時已變更，請等其他人物處理作業完成後再試。');
    const project = path.join(runDir, 'project');
    snapshotProject(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), project);
    fs.writeFileSync(path.join(runDir, 'composition.json'), JSON.stringify(built.metadata, null, 2) + '\n');
    await run(process.execPath, [hf, 'lint', project]);
    if (options['prepare-only']) {
      status('素材與模板已準備好；尚未去背或輸出 MP4。', { status: 'prepared', project });
      console.log('預覽：pnpm preview:editorial-explainer\n輸出：pnpm generate:editorial-explainer' + (config.persona.mode === 'original' || preparedManifest(config)?.engine === 'sam2' ? ' --current' : ''));
      return;
    }
    status('4/5 HyperFrames 檢查版面與時間軸');
    await run(process.execPath, [hf, 'check', project, '--samples', '5', '--snapshots', '--budget', '90s']);
    status('5/5 HyperFrames 輸出 MP4');
    const partial = path.join(runDir, 'video.partial.mp4'), output = path.join(runDir, 'video.mp4');
    await run(process.execPath, [hf, 'render', project, '--output', partial, '--format', 'mp4', '--fps', '30', '--quality', options.quality, '--strict']);
    verifyOutput(partial, built.metadata);
    fs.renameSync(partial, output);
    status('完成：' + output, { status: 'done', output, duration: built.metadata.duration });
    await openFile(output, options['no-open']);
  } catch (error) {
    if (job) {
      status('未完成', { status: abort.signal.aborted ? 'cancelled' : 'failed', failedStage: job.stage, error: error.message });
      console.error('紀錄與本次設定保留在：' + runDir);
    }
    throw error;
  } finally {
    questions?.close();
    process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
    if (log) await new Promise(resolve => log.end(resolve));
    release?.();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('\n' + error.message); process.exitCode = 1; });
}
