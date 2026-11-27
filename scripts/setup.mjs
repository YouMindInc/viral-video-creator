#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { repositoryRoot as repo, resolveWhisperModel } from './runtime-paths.mjs';

const app = path.join(repo, 'templates/editorial-explainer');
const sam2 = path.join(repo, 'tools/sam2');
const python = path.join(sam2, '.venv/bin/python');
const samManifest = JSON.parse(fs.readFileSync(path.join(sam2, 'model-files.sha256.json'), 'utf8'));
const whisper = JSON.parse(fs.readFileSync(new URL('./whisper-model.json', import.meta.url), 'utf8'));
const help = `Usage: pnpm setup:editorial-explainer [options]

Set up HyperFrames/GSAP, FFmpeg, uv/Python 3.12, the SAM2 environment,
Apple's Core ML SAM2 model, and a Chrome browser for HyperFrames.
Existing working dependencies and verified models are reused.

  --with-whisper  Also install whisper-cli and the multilingual subtitle model (~1.6 GB)
  --check         Check installed dependencies and model checksums; make no changes
  --dry-run       Show missing components and the installation plan; make no changes
  --sam2-only     Set up only FFmpeg, uv/Python and SAM2 (pnpm setup:sam2)
  --help          Show this help

Requires Apple Silicon macOS and Node.js 22+. Install Node.js and pnpm first.
Homebrew is needed only when ffmpeg, uv, or whisper-cli is missing.
Downloads retain their cache; rerun this command after a network interruption.
`;

export function checksum(file) {
  const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(file, 'r');
  try { let n; while ((n = fs.readSync(fd, buffer)) > 0) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
export function inspectFiles(directory, files) {
  const missing = [], corrupt = [];
  for (const [relative, expected] of Object.entries(files)) {
    const file = path.resolve(directory, relative);
    if (!file.startsWith(path.resolve(directory) + path.sep)) throw new Error('Invalid model manifest path: ' + relative);
    if (!fs.existsSync(file)) missing.push(relative);
    else if (!fs.statSync(file).isFile() || checksum(file) !== expected) corrupt.push(relative);
  }
  return { ready: !missing.length && !corrupt.length, missing, corrupt };
}
function executable(name, env = process.env) {
  const folders = [...(env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.local/bin'),
    '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), 'apps/homebrew-main/bin')];
  for (const dir of folders.filter(Boolean)) {
    const file = path.join(dir, name);
    try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch {}
  }
  return null;
}
function capture(bin, args, cwd = repo) {
  return spawnSync(bin, args, { cwd, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
}
function working(name, args) {
  const file = executable(name);
  return file && capture(file, args).status === 0 ? file : null;
}
function nodeDependencies() {
  try {
    const require = createRequire(path.join(app, 'package.json'));
    const dependencies = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).dependencies;
    for (const [name, version] of Object.entries(dependencies)) {
      if (JSON.parse(fs.readFileSync(require.resolve(name + '/package.json'), 'utf8')).version !== version) return null;
    }
    const hf = path.join(path.dirname(require.resolve('hyperframes/package.json')), 'bin/hyperframes.mjs');
    return capture(process.execPath, [hf, '--version']).status === 0 ? hf : null;
  } catch { return null; }
}
function pythonEnvironment() {
  if (fs.existsSync(path.dirname(path.dirname(python))) && fs.lstatSync(path.dirname(path.dirname(python))).isSymbolicLink()) return { environment: false, packages: false };
  if (!fs.existsSync(python)) return { environment: false, packages: false };
  // Metadata checks avoid importing Core ML or compiling/loading models during setup.
  const script = `import sys, json, pathlib, importlib.util, importlib.metadata as m
expected = pathlib.Path(sys.argv[1]).resolve()
pins = json.loads(sys.argv[2])
modules = ['coremltools', 'cv2', 'numpy', 'PIL']
ok = sys.version_info[:2] == (3, 12) and pathlib.Path(sys.prefix).resolve() == expected
packages = False
try:
    packages = all(m.version(k) == v for k, v in pins.items()) and all(importlib.util.find_spec(k) for k in modules)
except m.PackageNotFoundError:
    pass
print(json.dumps(dict(environment=ok, packages=bool(packages))))`;
  const pins = Object.fromEntries([...fs.readFileSync(path.join(sam2, 'requirements.txt'), 'utf8').matchAll(/^([\w-]+)==([^\s]+)$/gm)].map(m => [m[1], m[2]]));
  const result = capture(python, ['-c', script, path.join(sam2, '.venv'), JSON.stringify(pins)], sam2);
  try { if (result.status === 0) return JSON.parse(result.stdout); } catch {}
  return { environment: false, packages: false };
}
export function inspectSetup(options = {}) {
  const hf = options.sam2Only ? null : nodeDependencies();
  let chrome = null;
  if (hf) {
    const result = capture(process.execPath, [hf, 'browser', 'path']);
    const file = result.stdout?.trim();
    if (result.status === 0 && file) { try { fs.accessSync(file, fs.constants.X_OK); chrome = file; } catch {} }
  }
  const modelPath = resolveWhisperModel();
  let whisperModel = { ready: false, missing: [whisper.filename], corrupt: [] };
  if (options.withWhisper) {
    if (process.env.WHISPER_MODEL) {
      // Custom models are user-managed: never replace one with our default model.
      let ready = false;
      if (fs.existsSync(modelPath) && fs.statSync(modelPath).isFile()) {
        const fd = fs.openSync(modelPath, 'r'), header = Buffer.alloc(4);
        try { ready = fs.readSync(fd, header) === 4 && header.toString('hex') === '6c6d6767' && fs.statSync(modelPath).size > 1024; }
        finally { fs.closeSync(fd); }
      }
      whisperModel = { ready, custom: true, missing: [], corrupt: [] };
    } else whisperModel = inspectFiles(path.dirname(modelPath), { [path.basename(modelPath)]: whisper.sha256 });
  }
  return {
    platform: process.platform, arch: process.arch, nodeMajor: Number(process.versions.node.split('.')[0]),
    brew: executable('brew'), ffmpeg: working('ffmpeg', ['-version']), ffprobe: working('ffprobe', ['-version']),
    uv: working('uv', ['--version']), hf, chrome, python: pythonEnvironment(),
    samModel: inspectFiles(sam2, samManifest.files),
    whisperCli: options.withWhisper ? working('whisper-cli', ['--help']) : null, whisperModel, modelPath
  };
}

export function planSetup(state, options = {}) {
  const steps = [], issues = [], tools = [];
  if (state.platform !== 'darwin' || state.arch !== 'arm64') issues.push('SAM2 requires Apple Silicon macOS.');
  if (state.nodeMajor < 22) issues.push('Node.js 22+ is required.');
  if (!state.ffmpeg || !state.ffprobe) tools.push('ffmpeg');
  if (!state.uv) tools.push('uv');
  if (options.withWhisper && !state.whisperCli) tools.push('whisper.cpp');
  if (tools.length) {
    if (!state.brew) issues.push('Install Homebrew from https://brew.sh, then rerun setup. Missing tools: ' + tools.join(', '));
    steps.push({ id: 'tools', label: 'Install missing system tools: ' + tools.join(', '), formulas: tools });
  }
  if (!options.sam2Only && !state.hf) steps.push({ id: 'node', label: 'Install locked pnpm workspace dependencies (HyperFrames and GSAP)' });
  if (!state.python.environment) steps.push({ id: 'venv', label: 'Create tools/sam2/.venv with Python 3.12' });
  if (!state.python.environment || !state.python.packages) steps.push({ id: 'python', label: 'Install pinned SAM2 Python packages, reusing local wheels when present' });
  if (!state.samModel.ready) steps.push({ id: 'sam-model', label: `Download/repair ${state.samModel.missing.length + state.samModel.corrupt.length} SAM2 model file(s)` });
  if (options.withWhisper && !state.whisperModel.ready) {
    if (state.whisperModel.custom) issues.push('WHISPER_MODEL must point to an existing GGML Whisper model; setup will not overwrite a custom path.');
    else steps.push({ id: 'whisper-model', label: 'Download/repair the multilingual Whisper model (~1.6 GB)' });
  }
  if (!options.sam2Only && !state.chrome) steps.push({ id: 'chrome', label: 'Find or download Chrome for HyperFrames rendering' });
  return { steps, issues, ready: !steps.length && !issues.length };
}

export function hfDownloadArgs(model, revision, destination, files, force = false) {
  if (!/^[a-f\d]{40}$/i.test(revision) || !files.length || files.some(f => path.isAbsolute(f) || f.split('/').includes('..'))) throw new Error('Invalid model download manifest.');
  return ['tool', 'run', '--from', 'huggingface-hub==1.13.0', '--python', '3.12', 'hf', 'download', model,
    ...files, '--revision', revision, '--local-dir', destination, '--max-workers', '2', ...(force ? ['--force-download'] : [])];
}
function run(bin, args, cwd = repo) {
  console.log('  Running: ' + [bin, ...args].map(s => /\s/.test(s) ? JSON.stringify(s) : s).join(' '));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: 'inherit', env: { ...process.env,
      HF_HUB_DOWNLOAD_TIMEOUT: process.env.HF_HUB_DOWNLOAD_TIMEOUT || '120',
      HF_HUB_ETAG_TIMEOUT: process.env.HF_HUB_ETAG_TIMEOUT || '30' } });
    const heartbeat = setInterval(() => console.log('  Still running; cached downloads will be reused if you rerun setup.'), 20000);
    const interrupt = () => child.kill('SIGTERM');
    process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
    const done = () => { clearInterval(heartbeat); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); };
    child.once('error', error => { done(); reject(error); });
    child.once('close', (code, signal) => { done(); code === 0 ? resolve() : reject(new Error(path.basename(bin) + ' failed (' + (signal || code) + '). Rerun setup to continue.')); });
  });
}
export async function replaceEnvironment(directory, create) {
  const backup = directory + '.backup-' + Date.now();
  let existed = false;
  try { fs.lstatSync(directory); existed = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existed) { fs.renameSync(directory, backup); console.log('  Previous environment preserved at ' + backup); }
  try { await create(); }
  catch (error) {
    if (existed) {
      if (fs.existsSync(directory)) fs.renameSync(directory, directory + '.failed-' + Date.now());
      fs.renameSync(backup, directory);
    }
    throw error;
  }
}
async function downloadModels(state, model, revision, folder, integrity, prefix = '') {
  for (const [files, force] of [[state.missing, false], [state.corrupt, true]]) {
    if (!files.length) continue;
    await run(executable('uv'), hfDownloadArgs(model, revision, folder, files.map(file => file.slice(prefix.length)), force), sam2);
  }
  const checked = inspectFiles(prefix ? sam2 : folder, integrity);
  if (!checked.ready) throw new Error('Model checksum verification failed: ' + [...checked.missing, ...checked.corrupt].join(', '));
}

export async function installSteps(plan, execute, verify) {
  if (plan.issues.length) throw new Error(plan.issues.join('\n'));
  for (const step of plan.steps) { console.log('\n' + step.label); await execute(step); }
  const remaining = await verify();
  if (!remaining.ready) throw new Error('Setup is incomplete:\n' + [...remaining.issues, ...remaining.steps.map(s => s.label)].join('\n'));
}

export function acquireSetupLock(directory = repo) {
  const lock = path.join(directory, '.cache/setup.lock');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid setup lock: ' + lock);
    let alive = true;
    try { process.kill(pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new Error('Another setup is still running. Wait for it to finish before trying again.');
    fs.unlinkSync(lock);
  }
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
  return () => fs.unlinkSync(lock);
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv.filter(a => a !== '--'), options: {
    help: { type: 'boolean' }, check: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    'with-whisper': { type: 'boolean' }, 'sam2-only': { type: 'boolean' }
  } });
  if (values.help) { console.log(help); return; }
  const options = { withWhisper: values['with-whisper'], sam2Only: values['sam2-only'] };
  if (options.sam2Only && options.withWhisper) throw new Error('Use the full setup command with --with-whisper.');
  console.log('Checking installed dependencies and model checksums…');
  const state = inspectSetup(options), plan = planSetup(state, options);
  for (const [label, ready] of [
    ['FFmpeg / FFprobe', state.ffmpeg && state.ffprobe], ['uv', state.uv],
    ['Python 3.12 environment', state.python.environment], ['SAM2 Python packages', state.python.packages],
    ['SAM2 model checksums', state.samModel.ready],
    ...(!options.sam2Only ? [['HyperFrames / GSAP', state.hf], ['Chrome executable', state.chrome]] : []),
    ...(options.withWhisper ? [['whisper-cli', state.whisperCli], ['Whisper model', state.whisperModel.ready]] : [])
  ]) console.log(`  ${ready ? 'OK' : 'MISSING / NEEDS REPAIR'}  ${label}`);
  for (const issue of plan.issues) console.log('  ' + issue);
  if (values.check || values['dry-run']) {
    for (const step of plan.steps) console.log('  Would: ' + step.label);
    console.log(plan.ready ? 'All requested components are installed. No changes made.' : 'No changes made. Run setup without --check/--dry-run to install missing components.');
    if (values.check && !plan.ready) process.exitCode = 1;
    return;
  }
  if (plan.issues.length) throw new Error(plan.issues.join('\n'));
  const release = plan.steps.length ? acquireSetupLock() : () => {};
  try { await installSteps(plan, async step => {
    if (step.id === 'tools') await run(executable('brew'), ['install', ...step.formulas]);
    if (step.id === 'node') {
      const pm = process.env.npm_execpath;
      if (pm && /pnpm/i.test(path.basename(pm))) {
        await run(/\.[cm]?js$/.test(pm) ? process.execPath : pm, [...(/\.[cm]?js$/.test(pm) ? [pm] : []), 'install', '--frozen-lockfile', '--prefer-offline']);
      } else {
        const pnpm = executable('pnpm');
        if (!pnpm) throw new Error('Install pnpm 10.14.0 first, then rerun setup.');
        await run(pnpm, ['install', '--frozen-lockfile', '--prefer-offline']);
      }
    }
    if (step.id === 'venv') await replaceEnvironment(path.dirname(path.dirname(python)), () => run(executable('uv'), ['venv', '--python', '3.12', '.venv'], sam2));
    // wheels/ is a local, gitignored offline cache; uv fails on a missing --find-links directory.
    const wheels = fs.existsSync(path.join(sam2, 'wheels')) ? ['--find-links', 'wheels'] : [];
    if (step.id === 'python') await run(executable('uv'), ['pip', 'install', '--python', python, ...wheels, '-r', 'requirements.txt'], sam2);
    if (step.id === 'sam-model') await downloadModels(state.samModel, samManifest.model, samManifest.revision,
      path.join(sam2, 'models/coreml-sam2-small'), samManifest.files, 'models/coreml-sam2-small/');
    if (step.id === 'whisper-model') await downloadModels(state.whisperModel, whisper.model, whisper.revision,
      path.dirname(state.modelPath), { [whisper.filename]: whisper.sha256 });
    if (step.id === 'chrome') {
      const hf = nodeDependencies();
      if (!hf) throw new Error('HyperFrames dependencies are still missing.');
      await run(process.execPath, [hf, 'browser', 'ensure']);
    }
  }, () => planSetup(inspectSetup(options), options)); }
  finally { release(); }
  console.log('\nSetup complete. Existing working components were reused.');
  if (options.withWhisper) console.log('Whisper model: ' + resolveWhisperModel());
  console.log(options.sam2Only ? 'Next: pnpm sam2:test' : 'Next: pnpm generate:editorial-explainer');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('\n' + error.message); process.exitCode = 1; });
}
